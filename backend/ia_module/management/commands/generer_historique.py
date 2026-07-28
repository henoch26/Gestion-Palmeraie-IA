"""
Commande Django : génère des données de récolte historiques réalistes.

Usage :
  python manage.py generer_historique                    # 2014-2023
  python manage.py generer_historique --debut 2016       # depuis 2016
  python manage.py generer_historique --fin 2022         # jusqu'en 2022
  python manage.py generer_historique --reset            # supprime d'abord l'existant

Modèle agronomique :
  - Saisonnalité CI : deux pics de récolte (avril-juin et octobre-décembre)
  - Rendement par palmier : 8-20 régimes/an selon âge et saison
  - Progression : les palmiers plus âgés produisent plus (jusqu'à 12-14 ans)
  - Variation aléatoire ±20 % autour de la moyenne
"""
import random
from datetime import date, timedelta
from django.utils import timezone
from django.core.management.base import BaseCommand

# Facteur saisonnier par mois (CI : deux saisons des pluies)
# Pic 1 : avril-juin (récolte après grande saison des pluies oct-jan)
# Pic 2 : octobre-décembre (récolte après petite saison des pluies juillet-sept)
SAISONNIER = {
    1: 1.10, 2: 0.80, 3: 1.15, 4: 1.30, 5: 1.40,
    6: 1.45, 7: 0.85, 8: 0.75, 9: 0.95, 10: 1.30, 11: 1.35, 12: 1.15,
}

# Taux de base : régimes récoltés par palmier par fiche (cycle ~15 jours)
TAUX_BASE = 0.18

# Facteur de progression annuelle (les palmeraies jeunes montent en puissance)
def facteur_annuel(annee):
    if annee <= 2014: return 0.72
    if annee <= 2015: return 0.78
    if annee <= 2016: return 0.83
    if annee <= 2017: return 0.87
    if annee <= 2018: return 0.91
    if annee <= 2019: return 0.94
    if annee <= 2020: return 0.96
    if annee <= 2021: return 0.98
    return 1.00


class Command(BaseCommand):
    help = "Génère des données de récolte historiques réalistes sur plusieurs années"

    def add_arguments(self, parser):
        parser.add_argument("--debut", type=int, default=2014, help="Année de début (défaut: 2014)")
        parser.add_argument("--fin",   type=int, default=2023, help="Année de fin (défaut: 2023)")
        parser.add_argument("--reset", action="store_true", help="Supprime les fiches existantes sur cette période avant génération")
        parser.add_argument("--seed",  type=int, default=42,  help="Graine aléatoire pour la reproductibilité")

    def handle(self, *args, **options):
        from django.contrib.auth.models import User
        from secteurs.models import Secteur
        from recolteurs.models import Personnel
        from recoltes.models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail

        random.seed(options["seed"])

        annee_debut = options["debut"]
        annee_fin   = options["fin"]
        date_debut  = date(annee_debut, 1, 1)
        date_fin    = date(annee_fin, 12, 31)

        # ── Données de référence ─────────────────────────────────────────
        admin = User.objects.filter(is_superuser=True).first()
        if not admin:
            admin = User.objects.first()
        if not admin:
            self.stderr.write(self.style.ERROR("Aucun utilisateur trouvé. Créez un superutilisateur d'abord."))
            return

        secteurs   = list(Secteur.objects.all())
        recolteurs = list(Personnel.objects.all())

        if not secteurs:
            self.stderr.write(self.style.ERROR("Aucun secteur trouvé."))
            return
        if not recolteurs:
            self.stderr.write(self.style.ERROR("Aucun récolteur trouvé."))
            return

        # ── Reset optionnel ──────────────────────────────────────────────
        if options["reset"]:
            nb = FicheRecolte.objects.filter(date__gte=date_debut, date__lte=date_fin).count()
            FicheRecolte.objects.filter(date__gte=date_debut, date__lte=date_fin).delete()
            self.stdout.write(f"  {nb} fiche(s) supprimée(s) sur la période.")

        # ── Eviter les doublons sur les dates déjà présentes ─────────────
        dates_existantes = set(
            FicheRecolte.objects.filter(date__gte=date_debut, date__lte=date_fin)
            .values_list("date", flat=True)
        )

        self.stdout.write(f"Génération de {annee_debut} à {annee_fin}…")

        nb_fiches  = 0
        nb_lignes  = 0
        nb_details = 0

        for annee in range(annee_debut, annee_fin + 1):
            fa = facteur_annuel(annee)

            for mois in range(1, 13):
                fs = SAISONNIER[mois]

                # 2 fiches par mois (récolte ~tous les 15 jours)
                for cycle in range(2):
                    # Jours de collecte : début et milieu de mois
                    base_jour = 5 if cycle == 0 else 20
                    jour = base_jour + random.randint(-2, 3)
                    try:
                        fiche_date = date(annee, mois, max(1, min(28, jour)))
                    except ValueError:
                        continue

                    if fiche_date in dates_existantes:
                        continue

                    # ── Créer la fiche ────────────────────────────────────
                    fiche = FicheRecolte.objects.create(
                        date=fiche_date,
                        statut="valide",
                        created_by=admin,
                        validated_by=admin,
                        validated_at=timezone.make_aware(
                            timezone.datetime(fiche_date.year, fiche_date.month, fiche_date.day)
                        ),
                        observations=f"Récolte cycle {cycle+1} — {mois:02d}/{annee}",
                    )
                    dates_existantes.add(fiche_date)
                    nb_fiches += 1

                    # ── 8 à 12 récolteurs par fiche ───────────────────────
                    n_recs = random.randint(8, min(12, len(recolteurs)))
                    recs_fiche = random.sample(recolteurs, n_recs)

                    total_salaire = 0
                    total_depense = 0

                    for rec in recs_fiche:
                        heures = round(random.uniform(5.5, 9.0), 1)

                        # Type de régime : majoritairement moyens
                        regime = random.choices(
                            ["grands", "moyens", "petits"],
                            weights=[20, 60, 20]
                        )[0]

                        ligne = FicheRecolteLigne.objects.create(
                            fiche=fiche,
                            recolteur=rec,
                            recolteur_nom=rec.nom,
                            regime_type=regime,
                            nb_heures_travail=heures,
                            salaire_calcule=0,
                            prime_qualite=0,
                        )
                        nb_lignes += 1

                        # ── 2 à 5 secteurs par récolteur ─────────────────
                        n_secs = random.randint(2, min(5, len(secteurs)))
                        secs_ligne = random.sample(secteurs, n_secs)

                        total_qty_rec = 0
                        for sec in secs_ligne:
                            # Quantité : nb_palmiers × taux × facteurs ÷ nb_récolteurs
                            nb_palms = sec.nb_palmiers or 100
                            base = nb_palms * TAUX_BASE * fa * fs / max(n_recs, 1)
                            # Variation ±25 %
                            qty = max(1, round(base * random.uniform(0.75, 1.25)))

                            # Bonus productivité grands régimes
                            if regime == "grands":
                                qty = max(1, round(qty * random.uniform(0.80, 1.00)))
                            elif regime == "petits":
                                qty = max(1, round(qty * random.uniform(1.00, 1.20)))

                            FicheRecolteDetail.objects.create(
                                ligne=ligne,
                                secteur=sec,
                                secteur_code=sec.code,
                                quantite=qty,
                            )
                            nb_details += 1
                            total_qty_rec += qty

                        # Salaire : 150 FCFA/régime + 500 FCFA/heure
                        salaire = round(total_qty_rec * 150 + heures * 500)
                        prime   = round(salaire * 0.05) if regime == "grands" else 0
                        ligne.salaire_calcule = salaire
                        ligne.prime_qualite   = prime
                        ligne.save(update_fields=["salaire_calcule", "prime_qualite"])
                        total_salaire += salaire + prime
                        total_depense += salaire + prime

                    fiche.depense_salaire = total_salaire
                    fiche.depense_total   = total_depense + random.randint(5000, 25000)
                    fiche.save(update_fields=["depense_salaire", "depense_total"])

            self.stdout.write(f"  {annee} terminé ({nb_fiches} fiches cumulées)")

        self.stdout.write(self.style.SUCCESS(
            f"\nGénération terminée :"
            f"\n  {nb_fiches} fiches de récolte"
            f"\n  {nb_lignes} lignes récolteur"
            f"\n  {nb_details} détails secteur"
        ))
