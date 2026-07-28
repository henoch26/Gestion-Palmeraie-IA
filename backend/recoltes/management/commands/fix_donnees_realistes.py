"""
management command : fix_donnees_realistes.py

Corrige/régénère en base les données synthétiques de récolte, ventes et
personnel (FicheRecolte, FicheRecolteLigne, FicheRecolteDetail,
FicheRecuVente, Client, Personnel) pour respecter les contraintes
agronomiques, financières et de workflow réelles de l'application :

  - cycle de récolte par secteur (>=10 jours entre deux passages)
  - saisonnalité (plus de fiches/volume en saison des pluies)
  - composition d'une fiche (3-5 récolteurs, 1-3 lignes/récolteur, 1-3 détails/ligne)
  - quantités par détail (5-40 régimes)
  - salaire = quantité × barème (laissé aux signaux existants, jamais recalculé ici)
  - reçus de vente cohérents avec le volume récolté et la date de la fiche
  - workflow de validation cohérent
  - acteurs (personnel, clients) plausibles et récurrents dans le temps

Usage :
  python manage.py fix_donnees_realistes --dry-run     # audit seul, aucune écriture
  python manage.py fix_donnees_realistes                # corrige/régénère (seed=42)
  python manage.py fix_donnees_realistes --seed 123      # graine différente

Idempotence : le calendrier des fiches et tout le contenu (récolteurs,
régimes, quantités, prix...) sont pilotés par un random.Random() re-seedé
de façon déterministe (seed global, ou seed+fiche.id) — rejouer la commande
produit exactement le même état, sans dupliquer aucune ligne.
"""
import random
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max, Min, Sum
from django.utils import timezone

RAINY_MONTHS = {4, 5, 6, 7, 10, 11}
DRY_MONTHS = {12, 1, 2, 3}
# 8, 9 = mois intermédiaires (ni pluies ni sèche)

REGIMES = ["grands", "moyens", "petits"]
QUALITES = ["A", "A", "A", "B", "B", "C"]

# Patronymes ivoiriens pour renommer les récolteurs au nom générique ("Recolteur 7"...)
NOMS_RENOMMAGE = [
    ("Yao", "Michel"),
    ("Bamba", "Issouf"),
    ("Kouassi", "Roger"),
    ("Konan", "Serge"),
    ("Kouadio", "Paul"),
]

CLIENTS_INSTITUTIONNELS = [
    {"nom": "SAPH", "telephone": "0122456789", "adresse": "Zone industrielle, Abidjan"},
    {"nom": "PALMCI", "telephone": "0122567890", "adresse": "Treichville, Abidjan"},
    {"nom": "OILPALM", "telephone": "0122678901", "adresse": "Anyama"},
]

# Paliers d'embauche du personnel : l'équipe grossit progressivement sur 12 ans
PALIERS_EMBAUCHE = [
    (date(2012, 6, 1), date(2013, 11, 1)),
    (date(2016, 1, 1), date(2016, 11, 1)),
    (date(2019, 1, 1), date(2019, 11, 1)),
    (date(2022, 1, 1), date(2022, 11, 1)),
    (date(2024, 1, 1), date(2024, 11, 1)),
]


class Command(BaseCommand):
    help = (
        "Audite puis corrige/régénère les fiches de récolte, reçus de vente et "
        "personnel pour un réalisme agronomique, financier et de workflow."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="N'affiche que l'audit avant/après, n'écrit rien en base.",
        )
        parser.add_argument(
            "--seed", type=int, default=42,
            help="Graine aléatoire (défaut 42) — garantit l'idempotence.",
        )

    # ------------------------------------------------------------------ #
    # Entrée principale
    # ------------------------------------------------------------------ #
    def handle(self, *args, **options):
        from agents.models import SuperviseurGeneral
        from django.contrib.auth.models import User
        from recolteurs.models import Personnel
        from recoltes.models import (
            Client,
            FicheRecolte,
            FicheRecolteDetail,
            FicheRecolteLigne,
            FicheRecuVente,
            ParametreBonus,
        )
        from secteurs.models import Secteur

        self.seed = options["seed"]

        self.stdout.write(self.style.SUCCESS("=== AUDIT AVANT CORRECTION ==="))
        self._audit(FicheRecolte, FicheRecolteLigne, FicheRecolteDetail, FicheRecuVente, Client, Secteur, Personnel)

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("\n--dry-run : aucune écriture effectuée."))
            return

        with transaction.atomic():
            secteurs = list(Secteur.objects.order_by("id"))
            admin = (
                User.objects.filter(is_superuser=True, profile__role="admin").first()
                or User.objects.filter(is_superuser=True).first()
                or User.objects.first()
            )
            superviseurs = list(SuperviseurGeneral.objects.order_by("id"))

            self._fix_clients(Client)
            personnel = self._fix_personnel(Personnel)
            fiches = self._fix_calendrier_fiches(FicheRecolte, admin)
            self._fix_lignes_details(fiches, personnel, secteurs, superviseurs, admin)
            self._fix_recus_vente(FicheRecuVente, FicheRecolteDetail, FicheRecolte, Client, admin)
            self._fix_parametre_bonus(ParametreBonus)

        self.stdout.write(self.style.SUCCESS("\n=== AUDIT APRÈS CORRECTION ==="))
        self._audit(FicheRecolte, FicheRecolteLigne, FicheRecolteDetail, FicheRecuVente, Client, Secteur, Personnel)

    # ------------------------------------------------------------------ #
    # Audit (lecture seule)
    # ------------------------------------------------------------------ #
    def _audit(self, FicheRecolte, FicheRecolteLigne, FicheRecolteDetail, FicheRecuVente, Client, Secteur, Personnel):
        n = FicheRecolte.objects.count()
        bounds = FicheRecolte.objects.aggregate(mn=Min("date"), mx=Max("date"))
        self.stdout.write(f"Fiches de récolte : {n} | période : {bounds['mn']} -> {bounds['mx']}")
        self.stdout.write(
            f"Secteurs : {Secteur.objects.count()} | Personnel : {Personnel.objects.count()} | "
            f"Clients : {Client.objects.count()}"
        )
        self.stdout.write(
            f"Lignes : {FicheRecolteLigne.objects.count()} | Détails : {FicheRecolteDetail.objects.count()}"
        )

        # Violations du cycle de récolte (<10 jours) par secteur
        secteur_dates = {}
        for d in FicheRecolteDetail.objects.select_related("ligne__fiche"):
            if d.secteur_id and d.ligne and d.ligne.fiche_id:
                secteur_dates.setdefault(d.secteur_id, set()).add(d.ligne.fiche.date)
        violations = 0
        for dates in secteur_dates.values():
            dates = sorted(dates)
            for i in range(1, len(dates)):
                if (dates[i] - dates[i - 1]).days < 10:
                    violations += 1
        self.stdout.write(f"Violations cycle <10j par secteur : {violations}")

        # Cohérence salaire = quantité x barème
        mismatches = 0
        total_lignes = 0
        for l in FicheRecolteLigne.objects.select_related("fiche").prefetch_related("details"):
            total_lignes += 1
            total_q = sum(d.quantite for d in l.details.all())
            rate = {
                "grands": l.fiche.bareme_grands,
                "moyens": l.fiche.bareme_moyens,
                "petits": l.fiche.bareme_petits,
            }.get(l.regime_type, 0)
            expected = total_q * rate
            if l.salaire_calcule is None or abs(float(l.salaire_calcule) - float(expected)) > 1:
                mismatches += 1
        self.stdout.write(f"Lignes avec salaire incohérent : {mismatches} / {total_lignes}")

        # Workflow : validated_at/validated_by cohérents avec statut="valide"
        bad_workflow = 0
        for f in FicheRecolte.objects.filter(statut="valide").only("date", "validated_at", "validated_by_id"):
            if not f.validated_at or not f.validated_by_id or f.validated_at.date() < f.date:
                bad_workflow += 1
        self.stdout.write(f"Fiches 'valide' avec validated_at/by incohérent : {bad_workflow}")

        # Reçus de vente
        nb_recus = FicheRecuVente.objects.count()
        recu_bounds = FicheRecuVente.objects.aggregate(mn=Min("date"), mx=Max("date"))
        fiches_sans_recu = FicheRecolte.objects.filter(statut="valide", recus__isnull=True).count()
        self.stdout.write(
            f"Reçus de vente : {nb_recus} | période : {recu_bounds['mn']} -> {recu_bounds['mx']} | "
            f"fiches validées sans reçu : {fiches_sans_recu}"
        )
        prix_incoherents = 0
        for r in FicheRecuVente.objects.all():
            if r.pesee_kg and r.pesee_kg > 0:
                prix_kg = float(r.montant) / float(r.pesee_kg)
                if prix_kg < 60 or prix_kg > 180:
                    prix_incoherents += 1
        self.stdout.write(f"Reçus avec prix/kg hors fourchette (60-180 FCFA) : {prix_incoherents} / {nb_recus}")

    # ------------------------------------------------------------------ #
    # Correction : clients
    # ------------------------------------------------------------------ #
    def _fix_clients(self, Client):
        for c in CLIENTS_INSTITUTIONNELS:
            obj, created = Client.objects.get_or_create(
                nom=c["nom"], defaults={"telephone": c["telephone"], "adresse": c["adresse"]}
            )
            if created:
                self.stdout.write(f"  [+] Client institutionnel créé : {c['nom']}")

    # ------------------------------------------------------------------ #
    # Correction : personnel (embauches échelonnées + renommage des noms génériques)
    # ------------------------------------------------------------------ #
    def _fix_personnel(self, Personnel):
        personnel = list(Personnel.objects.order_by("id"))
        n = len(personnel)
        rng = random.Random(f"{self.seed}:personnel")
        rename_pool = list(NOMS_RENOMMAGE)

        for i, p in enumerate(personnel):
            palier = PALIERS_EMBAUCHE[min(i * len(PALIERS_EMBAUCHE) // n, len(PALIERS_EMBAUCHE) - 1)]
            hire_date = palier[0] + timedelta(days=rng.randint(0, (palier[1] - palier[0]).days))
            hire_dt = timezone.make_aware(datetime.combine(hire_date, time(9, 0)))
            update_fields = {"created_at": hire_dt}

            if p.nom.strip().lower().startswith("recolteur") and rename_pool:
                nom_famille, prenom = rename_pool.pop(0)
                update_fields["nom"] = f"{nom_famille} {prenom}"

            Personnel.objects.filter(pk=p.pk).update(**update_fields)
            p.created_at = hire_dt
            if "nom" in update_fields:
                self.stdout.write(f"  [~] Personnel #{p.pk} renommé -> {update_fields['nom']}")
                p.nom = update_fields["nom"]

        return personnel

    # ------------------------------------------------------------------ #
    # Correction : calendrier des fiches (espacement 10-15j, saisonnalité)
    # ------------------------------------------------------------------ #
    def _build_schedule(self, date_debut, date_fin):
        """Un espacement global >=10 jours entre fiches garantit par construction
        qu'aucun secteur n'est jamais re-récolté à moins de 10 jours d'écart,
        puisqu'un secteur ne peut apparaître que dans des fiches elles-mêmes
        espacées d'au moins 10 jours. La saisonnalité est injectée via la durée
        de l'écart : plus court (donc plus de fiches) en saison des pluies,
        plus long en saison sèche.
        """
        rng = random.Random(f"{self.seed}:calendrier")
        dates = []
        current = date_debut
        while current <= date_fin:
            dates.append(current)
            m = current.month
            if m in RAINY_MONTHS:
                gap = rng.randint(10, 12)
            elif m in DRY_MONTHS:
                gap = rng.randint(13, 15)
            else:
                gap = rng.randint(11, 13)
            current += timedelta(days=gap)
        return dates

    def _fix_calendrier_fiches(self, FicheRecolte, admin):
        existing = list(FicheRecolte.objects.order_by("id"))
        date_debut = min((f.date for f in existing), default=date(2014, 1, 8))
        date_fin = max((f.date for f in existing), default=date(2026, 6, 13))

        schedule = self._build_schedule(date_debut, date_fin)
        self.stdout.write(f"  Calendrier reconstruit : {len(schedule)} dates de fiches ({date_debut} -> {date_fin}).")

        fiches = []
        for i, d in enumerate(schedule):
            if i < len(existing):
                f = existing[i]
                f.date = d
                f.statut = "valide"
                f.bareme_grands, f.bareme_moyens, f.bareme_petits = 60, 50, 25
                f.save(update_fields=["date", "statut", "bareme_grands", "bareme_moyens", "bareme_petits"])
            else:
                f = FicheRecolte.objects.create(
                    date=d, statut="valide", created_by=admin,
                    bareme_grands=60, bareme_moyens=50, bareme_petits=25,
                )
            fiches.append(f)

        surplus = existing[len(schedule):]
        if surplus:
            self.stdout.write(f"  Suppression de {len(surplus)} fiche(s) en surplus (hors calendrier resserré).")
            FicheRecolte.objects.filter(pk__in=[f.pk for f in surplus]).delete()

        return fiches

    # ------------------------------------------------------------------ #
    # Correction : lignes/détails (composition, quantités, dépenses, workflow)
    # ------------------------------------------------------------------ #
    def _fix_lignes_details(self, fiches, personnel, secteurs, superviseurs, admin):
        from recoltes.models import FicheRecolteDetail, FicheRecolteLigne

        FicheRecolteLigne.objects.filter(fiche__in=fiches).delete()

        for fiche in fiches:
            rng = random.Random(f"{self.seed}:fiche:{fiche.pk}")
            rainy = fiche.date.month in RAINY_MONTHS

            pool = [p for p in personnel if p.created_at.date() <= fiche.date]
            if len(pool) < 3:
                pool = personnel[:3]

            n_recolteurs = min(rng.randint(4, 5) if rainy else rng.randint(3, 4), len(pool))
            recolteurs_du_jour = rng.sample(pool, n_recolteurs)

            sup = None
            if superviseurs:
                sup = superviseurs[0] if fiche.date.year < 2020 else superviseurs[-1]

            for rec in recolteurs_du_jour:
                k_regimes = rng.randint(1, min(3, len(REGIMES)))
                for regime in rng.sample(REGIMES, k_regimes):
                    ligne = FicheRecolteLigne.objects.create(
                        fiche=fiche,
                        recolteur=rec,
                        recolteur_nom=rec.nom,
                        regime_type=regime,
                        nb_heures_travail=round(rng.uniform(5.5, 9.0), 1),
                    )
                    k_secteurs = rng.randint(1, min(3, len(secteurs)))
                    qty_min, qty_max = (15, 40) if rainy else (5, 25)
                    for sec in rng.sample(secteurs, k_secteurs):
                        FicheRecolteDetail.objects.create(
                            ligne=ligne,
                            secteur=sec,
                            secteur_code=sec.code,
                            quantite=rng.randint(qty_min, qty_max),
                            qualite_regime=rng.choice(QUALITES),
                        )
                    # Le signal post_save de FicheRecolteDetail recalcule déjà
                    # ligne.salaire_calcule ainsi que depense_salaire/depense_total
                    # de la fiche — aucun calcul manuel ici.

            fiche.depense_nourriture = Decimal(rng.randint(1500, 3000) * n_recolteurs)
            fiche.depense_transport = Decimal(rng.randint(2000, 5000))
            fiche.superviseur_general_obj = sup
            fiche.superviseur_general = str(sup) if sup else ""
            fiche.created_by = sup.user if (sup and sup.user_id) else admin
            fiche.validated_by = admin
            validated_dt = timezone.make_aware(
                datetime.combine(fiche.date + timedelta(days=rng.randint(0, 2)), time(17, 0))
            )
            fiche.validated_at = validated_dt
            fiche.save(update_fields=[
                "depense_nourriture", "depense_transport", "superviseur_general_obj",
                "superviseur_general", "created_by", "validated_by", "validated_at",
            ])

    # ------------------------------------------------------------------ #
    # Correction : reçus de vente (un par fiche validée)
    # ------------------------------------------------------------------ #
    def _fix_recus_vente(self, FicheRecuVente, FicheRecolteDetail, FicheRecolte, Client, admin):
        clients = list(Client.objects.all())
        institutionnels = [c for c in clients if c.nom in {"SAPH", "PALMCI", "OILPALM"}]
        particuliers = [c for c in clients if c.nom not in {"SAPH", "PALMCI", "OILPALM"}]

        fiches = list(FicheRecolte.objects.filter(statut="valide").order_by("id"))
        n_created = 0

        for fiche in fiches:
            rng = random.Random(f"{self.seed}:recu:{fiche.pk}")
            total_regimes = FicheRecolteDetail.objects.filter(ligne__fiche=fiche).aggregate(
                s=Sum("quantite")
            )["s"] or 0

            recu, created = FicheRecuVente.objects.get_or_create(fiche=fiche)
            if created:
                n_created += 1

            poids_moyen = rng.uniform(15, 25)
            pesee_kg = Decimal(str(round(total_regimes * poids_moyen * rng.uniform(0.95, 1.05), 2)))

            annee = fiche.date.year
            # Prix officiel FCFA/kg : courbe indicative 80 (2014) -> 140 (2026), fixe pour l'année
            t = max(0.0, min(1.0, (annee - 2014) / 12))
            prix_officiel_annee = Decimal(str(round(80 + t * (140 - 80), 2)))
            prix_effectif = prix_officiel_annee * Decimal(str(round(rng.uniform(0.92, 1.08), 3)))
            montant = (pesee_kg * prix_effectif).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

            client_obj = None
            if institutionnels and (total_regimes > 150 or rng.random() < 0.4):
                client_obj = rng.choice(institutionnels)
            elif particuliers:
                client_obj = rng.choice(particuliers)

            recu_date = fiche.date + timedelta(days=rng.randint(1, 5))
            validated_dt = timezone.make_aware(datetime.combine(recu_date, time(rng.randint(8, 17), 0)))

            recu.date = recu_date
            recu.client_obj = client_obj
            recu.client = client_obj.nom if client_obj else ""
            recu.pesee_kg = pesee_kg
            recu.non_conformes_pct = Decimal(str(round(rng.uniform(0, 8), 2)))
            recu.montant = montant
            recu.prix_officiel = prix_officiel_annee
            recu.reference_facture = f"FAC-{annee}-{fiche.pk:05d}"
            recu.mode_paiement = "virement" if client_obj in institutionnels else "espece"
            recu.vehicule_transport = (
                f"Camion {rng.choice(['CI', 'AB', 'YAM'])}-{rng.randint(100, 999)}-{rng.choice(['A', 'B', 'C'])}"
            )
            recu.statut = "valide"
            recu.validated_by = admin
            recu.validated_at = validated_dt
            recu.save()

        self.stdout.write(f"  Reçus de vente : {n_created} créé(s), {len(fiches) - n_created} corrigé(s).")

    # ------------------------------------------------------------------ #
    # Correction : paramètre global de prix officiel
    # ------------------------------------------------------------------ #
    def _fix_parametre_bonus(self, ParametreBonus):
        pb = ParametreBonus.get_instance()
        pb.prix_kg_officiel = Decimal("140.00")
        pb.bareme_grands_defaut, pb.bareme_moyens_defaut, pb.bareme_petits_defaut = 60, 50, 25
        pb.save(update_fields=[
            "prix_kg_officiel", "bareme_grands_defaut", "bareme_moyens_defaut", "bareme_petits_defaut",
        ])
