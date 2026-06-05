from decimal import Decimal

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail


def _recalculer_salaire(ligne: FicheRecolteLigne):
    """Recalcule salaire_calcule sur la ligne (quantite × barème)."""
    try:
        fiche = ligne.fiche
    except Exception:
        return
    rates = {
        "grands": Decimal(str(getattr(fiche, "bareme_grands", 0) or 0)),
        "moyens": Decimal(str(getattr(fiche, "bareme_moyens", 0) or 0)),
        "petits": Decimal(str(getattr(fiche, "bareme_petits", 0) or 0)),
    }
    total_quantite = sum(int(d.quantite or 0) for d in ligne.details.all())
    taux = rates.get(ligne.regime_type, Decimal("0"))
    salaire = Decimal(str(total_quantite)) * taux
    FicheRecolteLigne.objects.filter(pk=ligne.pk).update(salaire_calcule=salaire)
    ligne.salaire_calcule = salaire


def _recalculer_depense_total(fiche: FicheRecolte):
    """
    depense_total = depense_nourriture + depense_transport + depense_salaire.
    depense_salaire est saisi manuellement sur la fiche.
    Utilise .update() pour éviter toute boucle de signal.
    """
    try:
        dep_n = fiche.depense_nourriture or Decimal("0")
        dep_t = fiche.depense_transport or Decimal("0")
        dep_s = fiche.depense_salaire or Decimal("0")
        total = dep_n + dep_t + dep_s
        FicheRecolte.objects.filter(pk=fiche.pk).update(depense_total=total)
        fiche.depense_total = total
    except Exception:
        pass


# ── Signals FicheRecolteDetail → recalcul salaire_calcule de la ligne ────────

@receiver(post_save, sender=FicheRecolteDetail)
def on_detail_saved(sender, instance, **kwargs):
    try:
        _recalculer_salaire(instance.ligne)
    except Exception:
        pass


@receiver(post_delete, sender=FicheRecolteDetail)
def on_detail_deleted(sender, instance, **kwargs):
    try:
        _recalculer_salaire(instance.ligne)
    except Exception:
        pass


# ── Signal FicheRecolte → recalcul depense_total quand nourriture/transport/salaire changent ──

@receiver(post_save, sender=FicheRecolte)
def on_fiche_recolte_saved(sender, instance, update_fields=None, **kwargs):
    # Évite la boucle : si on ne fait que mettre à jour depense_total, on ne refait pas
    if update_fields is not None and set(update_fields) == {"depense_total"}:
        return
    try:
        _recalculer_depense_total(instance)
    except Exception:
        pass
