from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from recoltes.models import FicheRecolteDetail, FicheRecolteLigne

from .models import Paiement


@dataclass
class PaiementComputed:
    recolteur_id: int | None
    recolteur_nom: str
    regimes_grands: int
    regimes_moyens: int
    regimes_petits: int
    total_regimes: int
    montant_fcfa: int


def _rates_for_fiche(fiche) -> dict[str, int]:
    return {
        "grands": int(getattr(fiche, "bareme_grands", 0) or 0),
        "moyens": int(getattr(fiche, "bareme_moyens", 0) or 0),
        "petits": int(getattr(fiche, "bareme_petits", 0) or 0),
    }


def compute_paiements_for_fiche(fiche) -> dict[tuple[str, str], PaiementComputed]:
    """
    Calcule (sans ecrire en base) les paiements par recolteur pour une fiche.
    Cle:
      - ("id", "<recolteur_id>") si recolteur reference
      - ("name", "<recolteur_nom>") sinon
    """
    rates = _rates_for_fiche(fiche)

    lignes = (
        FicheRecolteLigne.objects.filter(fiche=fiche)
        .select_related("recolteur")
        .only("id", "recolteur_id", "recolteur_nom", "regime_type", "recolteur__nom")
    )

    totals_by_line = {
        row["ligne_id"]: int(row["total"] or 0)
        for row in (
            FicheRecolteDetail.objects.filter(ligne__fiche=fiche)
            .values("ligne_id")
            .annotate(total=Sum("quantite"))
        )
    }

    computed: dict[tuple[str, str], PaiementComputed] = {}

    for line in lignes:
        qty = int(totals_by_line.get(line.id, 0) or 0)
        if qty <= 0:
            continue

        recolteur_id = line.recolteur_id
        if recolteur_id:
            key = ("id", str(recolteur_id))
            recolteur_nom = (getattr(line.recolteur, "nom", None) or line.recolteur_nom or "").strip()
        else:
            recolteur_nom = (line.recolteur_nom or "").strip() or "Sans nom"
            key = ("name", recolteur_nom)

        if key not in computed:
            computed[key] = PaiementComputed(
                recolteur_id=recolteur_id,
                recolteur_nom=recolteur_nom,
                regimes_grands=0,
                regimes_moyens=0,
                regimes_petits=0,
                total_regimes=0,
                montant_fcfa=0,
            )

        entry = computed[key]

        if line.regime_type == "grands":
            entry.regimes_grands += qty
        elif line.regime_type == "moyens":
            entry.regimes_moyens += qty
        elif line.regime_type == "petits":
            entry.regimes_petits += qty

        entry.total_regimes += qty
        entry.montant_fcfa += qty * int(rates.get(line.regime_type, 0) or 0)

    return computed


@transaction.atomic
def sync_paiements_for_fiche(fiche) -> list[Paiement]:
    """
    Synchronise la table Paiement pour une fiche (creation/maj/suppression soft).

    Regles:
    - On met a jour les montants/totaux a partir des lignes.
    - Si un paiement 'en_attente' n'a plus de lignes -> suppression.
    - Si un paiement deja paye/annule n'a plus de lignes -> marque obsolete.
    """
    # Si la fiche a deja ete payee, on fige l'etat (pas de recalcul possible).
    if Paiement.objects.filter(fiche=fiche, statut=Paiement.STATUT_PAYE).exists():
        return list(Paiement.objects.filter(fiche=fiche).select_related("recolteur"))

    computed = compute_paiements_for_fiche(fiche)

    existing = list(Paiement.objects.filter(fiche=fiche).select_related("recolteur"))
    existing_by_key: dict[tuple[str, str], Paiement] = {}
    for p in existing:
        if p.recolteur_id:
            existing_by_key[("id", str(p.recolteur_id))] = p
        else:
            existing_by_key[("name", (p.recolteur_nom or "").strip() or "Sans nom")] = p

    touched: list[Paiement] = []

    # Upsert computed entries
    for key, entry in computed.items():
        p = existing_by_key.pop(key, None)
        if p is None:
            p = Paiement(
                fiche=fiche,
                recolteur_id=entry.recolteur_id,
                recolteur_nom=entry.recolteur_nom,
            )

        p.recolteur_nom = entry.recolteur_nom
        p.regimes_grands = int(entry.regimes_grands)
        p.regimes_moyens = int(entry.regimes_moyens)
        p.regimes_petits = int(entry.regimes_petits)
        p.total_regimes = int(entry.total_regimes)
        p.montant_fcfa = int(entry.montant_fcfa)
        p.is_obsolete = False
        p.save()
        touched.append(p)

    # Handle remaining existing rows not present anymore in computed
    for _key, p in existing_by_key.items():
        if p.statut == Paiement.STATUT_EN_ATTENTE:
            p.delete()
            continue

        # Si deja paye/annule, on conserve (historique) mais on marque obsolete.
        if not p.is_obsolete:
            p.is_obsolete = True
            p.save(update_fields=["is_obsolete", "updated_at"])
        touched.append(p)

    return touched


@transaction.atomic
def set_paiement_statut(paiement: Paiement, statut: str) -> Paiement:
    if statut == Paiement.STATUT_PAYE:
        paiement.statut = Paiement.STATUT_PAYE
        paiement.paid_at = timezone.now()
    elif statut == Paiement.STATUT_EN_ATTENTE:
        paiement.statut = Paiement.STATUT_EN_ATTENTE
        paiement.paid_at = None
    elif statut == Paiement.STATUT_ANNULE:
        paiement.statut = Paiement.STATUT_ANNULE
        paiement.paid_at = None
    else:
        raise ValueError("Statut invalide")

    paiement.save(update_fields=["statut", "paid_at", "updated_at"])
    return paiement
