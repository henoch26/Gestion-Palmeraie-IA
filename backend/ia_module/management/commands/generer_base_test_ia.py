"""
Genere une base de test coherente pour le module IA.

Exemples:
  python manage.py generer_base_test_ia --dry-run
  python manage.py generer_base_test_ia --debut 2014 --fin 2026 --mois-fin 6
  python manage.py generer_base_test_ia --reset-synthetique --cycles-par-mois 4

Les donnees creees sont taguees SYNTH-IA pour pouvoir etre nettoyees sans
supprimer les saisies reelles.
"""
import random
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone


TAG = "[SYNTH-IA]"
METEO_SOURCE = "synthetique_ia"

SECTEURS_DEFAUT = [
    {"code": "GP_1", "nom": "GP 1", "superficie_ha": 7.47, "relief": "Plateau", "sol": "Sableux / Argileux"},
    {"code": "GP_2", "nom": "GP 2", "superficie_ha": 4.60, "relief": "Plateau / Pentus", "sol": "Argileux / Gravillonnaire"},
    {"code": "RTE_BOUB", "nom": "Rte Boub", "superficie_ha": 1.90, "relief": "Plateau", "sol": "Argileux"},
    {"code": "PM_1", "nom": "PM 1", "superficie_ha": 3.48, "relief": "Plateau / Pentus", "sol": "Gravillonnaire / Argileux / Sableux"},
    {"code": "PM_2", "nom": "PM 2", "superficie_ha": 4.44, "relief": "Pentus - Plateau", "sol": "Humifere - Argileux"},
    {"code": "JC_1", "nom": "JC 1", "superficie_ha": 6.80, "relief": "Pentus - Plateau", "sol": "Sableux - Humifere"},
    {"code": "JC_2", "nom": "JC 2", "superficie_ha": 1.17, "relief": "Plateau", "sol": "Sableux"},
    {"code": "CO", "nom": "CO", "superficie_ha": 2.07, "relief": "Plateau", "sol": "Argileux - Gravillonnaire"},
    {"code": "AA", "nom": "AA", "superficie_ha": 2.67, "relief": "Plateau", "sol": "Sableux - Argileux"},
]

SAISON_RECOLTE = {
    1: 1.10, 2: 0.82, 3: 1.12, 4: 1.30, 5: 1.40, 6: 1.45,
    7: 0.88, 8: 0.76, 9: 0.95, 10: 1.28, 11: 1.34, 12: 1.16,
}
METEO_MOIS = {
    1: (31, 23, 27, 28, 76), 2: (32, 24, 28, 35, 75), 3: (32, 24, 28, 85, 79),
    4: (31, 24, 28, 125, 82), 5: (30, 23, 27, 180, 85), 6: (29, 23, 26, 210, 87),
    7: (28, 22, 25, 95, 84), 8: (28, 22, 25, 65, 82), 9: (29, 23, 26, 95, 82),
    10: (30, 23, 27, 145, 84), 11: (31, 23, 27, 105, 81), 12: (31, 23, 27, 45, 78),
}
REGIMES = ["grands", "moyens", "petits"]
QUALITES = ["A", "B", "C"]


def _months(annee_debut, annee_fin, mois_fin):
    for annee in range(annee_debut, annee_fin + 1):
        last_month = mois_fin if annee == annee_fin else 12
        for mois in range(1, last_month + 1):
            yield annee, mois


def _age_factor(age_years):
    if age_years < 3:
        return 0.05
    if age_years < 6:
        return 0.35 + (age_years - 3) * 0.12
    if age_years < 10:
        return 0.72 + (age_years - 6) * 0.07
    if age_years <= 20:
        return 1.0
    if age_years <= 28:
        return max(0.65, 1.0 - (age_years - 20) * 0.035)
    return 0.58


class Command(BaseCommand):
    help = "Genere une base de test IA: recoltes, meteo et contexte agronomique."

    def add_arguments(self, parser):
        today = timezone.localdate()
        default_fin = today.year
        default_mois_fin = today.month - 1 if today.month > 1 else 12
        if today.month == 1:
            default_fin -= 1

        parser.add_argument("--debut", type=int, default=2014, help="Annee de debut.")
        parser.add_argument("--fin", type=int, default=default_fin, help="Annee de fin.")
        parser.add_argument("--mois-fin", type=int, default=default_mois_fin, help="Mois final pour l'annee de fin.")
        parser.add_argument("--cycles-par-mois", type=int, default=4, help="Nombre de passages recolte par mois.")
        parser.add_argument("--recolteurs", type=int, default=18, help="Nombre minimal de recolteurs de test.")
        parser.add_argument("--seed", type=int, default=42, help="Graine aleatoire.")
        parser.add_argument("--reset-synthetique", action="store_true", help="Supprime d'abord les donnees SYNTH-IA.")
        parser.add_argument("--skip-recoltes", action="store_true", help="Ne genere pas les fiches de recolte.")
        parser.add_argument("--skip-meteo", action="store_true", help="Ne genere pas la meteo mensuelle.")
        parser.add_argument("--skip-agronomie", action="store_true", help="Ne genere pas la chaine semence/pepiniere/plantation.")
        parser.add_argument("--dry-run", action="store_true", help="Affiche seulement les volumes estimes.")

    def handle(self, *args, **options):
        self._validate_options(options)
        rng = random.Random(options["seed"])
        dry_run = options["dry_run"]

        from secteurs.models import Secteur
        from recolteurs.models import Personnel

        secteurs = self._ensure_secteurs(Secteur, rng, dry_run)
        recolteurs = self._ensure_recolteurs(Personnel, options["recolteurs"], dry_run)
        admin = self._ensure_user(dry_run)

        if dry_run:
            self._dry_run_summary(options, secteurs, recolteurs)
            return

        with transaction.atomic():
            if options["reset_synthetique"]:
                self._reset_synthetique()
            if not options["skip_agronomie"]:
                agro_counts = self._generer_agronomie(secteurs, admin, rng, options["fin"])
            else:
                agro_counts = {}
            if not options["skip_meteo"]:
                meteo_count = self._generer_meteo(secteurs, rng, options["debut"], options["fin"], options["mois_fin"])
            else:
                meteo_count = 0
            if not options["skip_recoltes"]:
                recolte_counts = self._generer_recoltes(
                    secteurs=secteurs,
                    recolteurs=recolteurs,
                    admin=admin,
                    rng=rng,
                    debut=options["debut"],
                    fin=options["fin"],
                    mois_fin=options["mois_fin"],
                    cycles_par_mois=options["cycles_par_mois"],
                )
            else:
                recolte_counts = {}

        self._print_result(agro_counts, meteo_count, recolte_counts)

    def _validate_options(self, options):
        if options["debut"] > options["fin"]:
            raise ValueError("--debut ne peut pas etre superieur a --fin.")
        if options["mois_fin"] < 1 or options["mois_fin"] > 12:
            raise ValueError("--mois-fin doit etre compris entre 1 et 12.")
        if options["cycles_par_mois"] < 1 or options["cycles_par_mois"] > 8:
            raise ValueError("--cycles-par-mois doit etre compris entre 1 et 8.")
        if options["recolteurs"] < 1:
            raise ValueError("--recolteurs doit etre positif.")

    def _ensure_user(self, dry_run):
        from django.contrib.auth.models import User

        user = User.objects.filter(is_superuser=True).first() or User.objects.first()
        if user or dry_run:
            return user

        user = User.objects.create_user(username="synthetique_ia")
        user.set_unusable_password()
        user.save(update_fields=["password"])
        return user

    def _ensure_secteurs(self, Secteur, rng, dry_run):
        secteurs = list(Secteur.objects.order_by("code"))
        if secteurs or dry_run:
            return secteurs

        for item in SECTEURS_DEFAUT:
            Secteur.objects.create(
                code=item["code"],
                nom=item["nom"],
                superficie_ha=item["superficie_ha"],
                situation_relief=item["relief"],
                type_sol=item["sol"],
                age_moyen_plants=rng.randint(9, 18),
                nb_palmiers=max(80, int(float(item["superficie_ha"]) * rng.randint(125, 155))),
                rendement_cible_t_ha=Decimal(str(round(rng.uniform(12, 18), 2))),
            )
        return list(Secteur.objects.order_by("code"))

    def _ensure_recolteurs(self, Personnel, minimum, dry_run):
        recolteurs = list(Personnel.objects.order_by("id"))
        if dry_run:
            return recolteurs

        missing = max(0, minimum - len(recolteurs))
        start = (Personnel.objects.aggregate(mx=Max("id"))["mx"] or 0) + 1
        for i in range(missing):
            idx = start + i
            Personnel.objects.create(
                nom=f"Recolteur Synth {idx:03d}",
                lieu_residence="Village test",
                numero_telephone=f"0700{idx:06d}"[-10:],
                whatsapp_actif=idx % 2 == 0,
                est_wave=idx % 3 == 0,
            )
        return list(Personnel.objects.order_by("id"))

    def _reset_synthetique(self):
        from ia_module.models import DonneeMeteo
        from plantations.models import (
            LotPepiniere,
            LotSemence,
            ObservationSanitaire,
            OperationPlantation,
            SuiviCroissance,
            SuiviPepiniere,
        )
        from recoltes.models import FicheRecolte

        fiches = FicheRecolte.objects.filter(observations__contains=TAG)
        nb_fiches = fiches.count()
        fiches.delete()

        nb_meteo = DonneeMeteo.objects.filter(source=METEO_SOURCE).count()
        DonneeMeteo.objects.filter(source=METEO_SOURCE).delete()

        operations = OperationPlantation.objects.filter(code_operation__startswith="SYN-PLA")
        operation_ids = list(operations.values_list("id", flat=True))
        pepiniere_ids = list(operations.values_list("lot_pepiniere_id", flat=True))
        semence_ids = list(LotPepiniere.objects.filter(id__in=pepiniere_ids).values_list("lot_semence_id", flat=True))

        ObservationSanitaire.objects.filter(operation_plantation_id__in=operation_ids).delete()
        SuiviCroissance.objects.filter(operation_plantation_id__in=operation_ids).delete()
        operations.delete()
        SuiviPepiniere.objects.filter(lot_pepiniere_id__in=pepiniere_ids).delete()
        LotPepiniere.objects.filter(id__in=pepiniere_ids, code_lot__startswith="SYN-PEP").delete()
        LotSemence.objects.filter(id__in=semence_ids, code_lot__startswith="SYN-SEM").delete()

        self.stdout.write(f"Reset SYNTH-IA: {nb_fiches} fiche(s), {nb_meteo} meteo supprimee(s).")

    def _generer_agronomie(self, secteurs, admin, rng, reference_year):
        from plantations.models import (
            LotPepiniere,
            LotSemence,
            ObservationSanitaire,
            OperationPlantation,
            SuiviCroissance,
            SuiviPepiniere,
        )

        counts = {"semences": 0, "pepinieres": 0, "plantations": 0, "suivis": 0, "sanitaires": 0}
        for idx, secteur in enumerate(secteurs, start=1):
            age_years = int(secteur.age_moyen_plants or rng.randint(8, 18))
            if age_years <= 0:
                age_years = rng.randint(8, 18)
            plantation_year = max(1998, reference_year - age_years)
            date_plantation = date(plantation_year, rng.choice([2, 3, 4, 10, 11]), rng.randint(5, 20))
            date_acquisition = date_plantation - timedelta(days=420)
            date_pepiniere = date_plantation - timedelta(days=300)

            nb_palmiers = int(secteur.nb_palmiers or max(80, float(secteur.superficie_ha or 1) * 140))
            nb_graines = int(nb_palmiers * rng.uniform(1.25, 1.45))
            nb_germees = int(nb_graines * rng.uniform(0.82, 0.94))
            nb_valides = int(nb_germees * rng.uniform(0.88, 0.97))

            semence_code = self._code("SYN-SEM", secteur.code, idx)
            semence, created = LotSemence.objects.get_or_create(
                code_lot=semence_code,
                defaults={
                    "variete": rng.choice(["Tenera", "Dura x Pisifera", "La Me"]),
                    "fournisseur": rng.choice(["CNRA", "PALMCI", "Pepiniere certifiee"]),
                    "origine": "Base synthetique IA",
                    "certification": "Lot temoin",
                    "date_acquisition": date_acquisition,
                    "date_mise_en_germination": date_acquisition + timedelta(days=15),
                    "nombre_graines": nb_graines,
                    "nombre_graines_germees": nb_germees,
                    "statut": "pepiniere",
                    "observations": f"{TAG} lot semence de test",
                    "created_by": admin,
                },
            )
            counts["semences"] += int(created)

            pep_code = self._code("SYN-PEP", secteur.code, idx)
            pepiniere, created = LotPepiniere.objects.get_or_create(
                code_lot=pep_code,
                defaults={
                    "lot_semence": semence,
                    "date_entree": date_pepiniere,
                    "date_sortie_prevue": date_plantation - timedelta(days=10),
                    "date_sortie_reelle": date_plantation - timedelta(days=rng.randint(1, 8)),
                    "nombre_plants_initial": nb_germees,
                    "nombre_plants_valides": nb_valides,
                    "nombre_plants_rejetes": max(0, nb_germees - nb_valides - rng.randint(0, 15)),
                    "nombre_plants_morts": rng.randint(0, max(1, int(nb_germees * 0.05))),
                    "taille_moyenne_cm": Decimal(str(round(rng.uniform(70, 110), 2))),
                    "nombre_feuilles_moyen": Decimal(str(round(rng.uniform(8, 13), 2))),
                    "etat_sanitaire": rng.choice(["Bon", "Bon avec surveillance", "Correct"]),
                    "statut": "plante",
                    "observations": f"{TAG} lot pepiniere de test",
                    "created_by": admin,
                },
            )
            counts["pepinieres"] += int(created)

            for mois_offset in (2, 5, 8):
                obs_date = date_pepiniere + timedelta(days=mois_offset * 30)
                SuiviPepiniere.objects.get_or_create(
                    lot_pepiniere=pepiniere,
                    date_observation=obs_date,
                    defaults={
                        "nombre_plants_vivants": max(0, nb_germees - rng.randint(0, 25)),
                        "nombre_plants_morts": rng.randint(0, 15),
                        "taille_moyenne_cm": Decimal(str(round(20 + mois_offset * rng.uniform(7, 10), 2))),
                        "nombre_feuilles_moyen": Decimal(str(round(3 + mois_offset * rng.uniform(0.8, 1.2), 2))),
                        "etat_sanitaire": "Bon",
                        "observations": f"{TAG} suivi pepiniere",
                    },
                )

            op_code = self._code("SYN-PLA", secteur.code, idx)
            operation, created = OperationPlantation.objects.get_or_create(
                code_operation=op_code,
                defaults={
                    "secteur": secteur,
                    "lot_pepiniere": pepiniere,
                    "date_plantation": date_plantation,
                    "nombre_plants": nb_palmiers,
                    "ecartement_m": Decimal("8.50"),
                    "age_plants_mois": rng.randint(9, 12),
                    "plants_remplaces": rng.randint(0, max(1, int(nb_palmiers * 0.04))),
                    "conditions_meteo": "Conditions normales",
                    "statut": "suivi",
                    "observations": f"{TAG} operation plantation de test",
                    "created_by": admin,
                },
            )
            counts["plantations"] += int(created)

            for year in range(date_plantation.year + 1, reference_year + 1):
                obs_date = date(year, 6, min(28, rng.randint(10, 20)))
                suivi, created = SuiviCroissance.objects.get_or_create(
                    secteur=secteur,
                    date_observation=obs_date,
                    defaults={
                        "operation_plantation": operation,
                        "hauteur_moyenne_cm": Decimal(str(round(min(1400, 80 + (year - date_plantation.year) * rng.uniform(35, 70)), 2))),
                        "nombre_feuilles_moyen": Decimal(str(round(rng.uniform(18, 36), 2))),
                        "mortalite": rng.randint(0, max(1, int(nb_palmiers * 0.012))),
                        "plants_remplaces": rng.randint(0, max(1, int(nb_palmiers * 0.01))),
                        "stress_hydrique": rng.random() < 0.10,
                        "etat_general": rng.choices(["bon", "moyen", "faible"], weights=[70, 25, 5])[0],
                        "observations": f"{TAG} suivi croissance annuel",
                    },
                )
                counts["suivis"] += int(created)

            if rng.random() < 0.45:
                obs_date = date(reference_year, rng.randint(2, 11), rng.randint(5, 25))
                _, created = ObservationSanitaire.objects.get_or_create(
                    secteur=secteur,
                    operation_plantation=operation,
                    date_observation=obs_date,
                    type_probleme=rng.choice(["Jaunissement feuilles", "Stress hydrique", "Ravageurs localises"]),
                    defaults={
                        "gravite": rng.choices(["faible", "moyenne", "elevee"], weights=[55, 35, 10])[0],
                        "surface_touchee_ha": Decimal(str(round(float(secteur.superficie_ha or 1) * rng.uniform(0.02, 0.20), 2))),
                        "action_recommandee": "Controle terrain et suivi du secteur.",
                        "action_effectuee": "",
                        "statut": rng.choices(["resolue", "surveillance", "en_traitement"], weights=[55, 30, 15])[0],
                        "observations": f"{TAG} observation sanitaire",
                    },
                )
                counts["sanitaires"] += int(created)

            changed = []
            if not secteur.age_moyen_plants:
                secteur.age_moyen_plants = max(1, reference_year - date_plantation.year)
                changed.append("age_moyen_plants")
            if not secteur.nb_palmiers:
                secteur.nb_palmiers = nb_palmiers
                changed.append("nb_palmiers")
            if not secteur.rendement_cible_t_ha:
                secteur.rendement_cible_t_ha = Decimal(str(round(rng.uniform(12, 18), 2)))
                changed.append("rendement_cible_t_ha")
            if changed:
                secteur.save(update_fields=changed)

        return counts

    def _generer_meteo(self, secteurs, rng, debut, fin, mois_fin):
        from ia_module.models import DonneeMeteo

        count = 0
        for annee, mois in _months(debut, fin, mois_fin):
            base_tmax, base_tmin, base_tmoy, base_pluie, base_humid = METEO_MOIS[mois]
            for secteur in secteurs:
                relief_penalty = -0.4 if "Pentus" in (secteur.situation_relief or "") else 0
                d = date(annee, mois, 15)
                existing = DonneeMeteo.objects.filter(secteur=secteur, date=d).first()
                if existing and existing.source != METEO_SOURCE:
                    continue
                _, created = DonneeMeteo.objects.update_or_create(
                    secteur=secteur,
                    date=d,
                    defaults={
                        "temperature_max": round(base_tmax + relief_penalty + rng.gauss(0, 0.8), 1),
                        "temperature_min": round(base_tmin + relief_penalty + rng.gauss(0, 0.6), 1),
                        "temperature_moy": round(base_tmoy + relief_penalty + rng.gauss(0, 0.5), 1),
                        "precipitation_mm": round(max(0, base_pluie + rng.gauss(0, base_pluie * 0.18 + 8)), 1),
                        "humidite_pct": round(max(40, min(98, base_humid + rng.gauss(0, 2.5))), 1),
                        "vitesse_vent_kmh": round(max(1, rng.gauss(8, 2)), 1),
                        "description": f"{TAG} meteo mensuelle moyenne",
                        "source": METEO_SOURCE,
                    },
                )
                count += int(created)
        return count

    def _generer_recoltes(self, secteurs, recolteurs, admin, rng, debut, fin, mois_fin, cycles_par_mois):
        from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecolteLigne

        counts = {"fiches": 0, "lignes": 0, "details": 0}
        saison_sum = sum(SAISON_RECOLTE.values())

        for annee, mois in _months(debut, fin, mois_fin):
            last_day = monthrange(annee, mois)[1]
            spacing = max(1, last_day // (cycles_par_mois + 1))
            for cycle in range(1, cycles_par_mois + 1):
                day = min(last_day, max(1, cycle * spacing))
                fiche_date = date(annee, mois, day)
                observations = f"{TAG} recolte cycle {cycle}/{cycles_par_mois} - {mois:02d}/{annee}"

                fiche, created = FicheRecolte.objects.get_or_create(
                    date=fiche_date,
                    observations=observations,
                    defaults={
                        "statut": "valide",
                        "created_by": admin,
                        "validated_by": admin,
                        "validated_at": timezone.make_aware(datetime.combine(fiche_date, time(17, 0))),
                        "depense_nourriture": Decimal(str(rng.randint(6000, 18000))),
                        "depense_transport": Decimal(str(rng.randint(5000, 22000))),
                        "conditions_meteo": self._condition_meteo_label(mois),
                    },
                )
                if not created:
                    continue
                counts["fiches"] += 1

                selected = self._selected_recolteurs(recolteurs, rng, len(secteurs))
                for idx, secteur in enumerate(secteurs):
                    rec = selected[idx % len(selected)]
                    regime = rng.choices(REGIMES, weights=[24, 58, 18])[0]
                    ligne = FicheRecolteLigne.objects.create(
                        fiche=fiche,
                        recolteur=rec,
                        recolteur_nom=rec.nom,
                        regime_type=regime,
                        nb_heures_travail=Decimal(str(round(rng.uniform(5.5, 8.5), 1))),
                        prime_qualite=Decimal("0"),
                    )
                    counts["lignes"] += 1

                    qty = self._quantite_cycle(secteur, annee, mois, cycles_par_mois, saison_sum, regime, rng)
                    FicheRecolteDetail.objects.create(
                        ligne=ligne,
                        secteur=secteur,
                        secteur_code=secteur.code,
                        quantite=qty,
                        qualite_regime=rng.choices(QUALITES, weights=[55, 35, 10])[0],
                    )
                    counts["details"] += 1

                fiche.nb_palmiers_recoltes = sum(int(s.nb_palmiers or 0) for s in secteurs)
                fiche.surface_recoltee_ha = Decimal(str(round(sum(float(s.superficie_ha or 0) for s in secteurs), 2)))
                fiche.save(update_fields=["nb_palmiers_recoltes", "surface_recoltee_ha"])

        return counts

    def _quantite_cycle(self, secteur, annee, mois, cycles_par_mois, saison_sum, regime, rng):
        nb_palmiers = int(secteur.nb_palmiers or max(80, float(secteur.superficie_ha or 1) * 140))
        age_actuel = int(secteur.age_moyen_plants or 12)
        age_years = max(1, age_actuel - (timezone.localdate().year - annee))
        regimes_par_palmier_an = rng.uniform(12.0, 18.5)
        trend = 0.92 + min(0.14, max(0, annee - 2014) * 0.012)
        monthly_qty = (
            nb_palmiers
            * regimes_par_palmier_an
            * _age_factor(age_years)
            * trend
            * SAISON_RECOLTE[mois]
            / saison_sum
        )
        regime_factor = {"grands": 0.82, "moyens": 1.0, "petits": 1.14}.get(regime, 1.0)
        qty = monthly_qty / cycles_par_mois * regime_factor * rng.uniform(0.82, 1.18)
        return max(1, int(round(qty)))

    def _selected_recolteurs(self, recolteurs, rng, nb_secteurs):
        if not recolteurs:
            return []
        n = min(len(recolteurs), max(3, min(nb_secteurs, 8)))
        return rng.sample(recolteurs, n)

    def _condition_meteo_label(self, mois):
        pluie = METEO_MOIS[mois][3]
        if pluie >= 140:
            return "Pluvieux"
        if pluie <= 50:
            return "Sec"
        return "Variable"

    def _dry_run_summary(self, options, secteurs, recolteurs):
        nb_mois = sum(1 for _ in _months(options["debut"], options["fin"], options["mois_fin"]))
        nb_secteurs = len(secteurs) or len(SECTEURS_DEFAUT)
        nb_fiches = nb_mois * options["cycles_par_mois"]
        nb_details = nb_fiches * nb_secteurs
        self.stdout.write("Simulation SYNTH-IA:")
        self.stdout.write(f"  Mois couverts: {nb_mois}")
        self.stdout.write(f"  Secteurs: {nb_secteurs}")
        self.stdout.write(f"  Recolteurs disponibles/prevus: {max(len(recolteurs), options['recolteurs'])}")
        self.stdout.write(f"  Fiches recolte estimees: {nb_fiches}")
        self.stdout.write(f"  Details recolte estimes: {nb_details}")
        self.stdout.write(f"  Meteo mensuelle estimee: {nb_mois * nb_secteurs}")
        self.stdout.write("Dry-run uniquement: aucune donnee ecrite.")

    def _print_result(self, agro_counts, meteo_count, recolte_counts):
        from ia_module.services.data_collector import DataCollector

        rows = DataCollector().collect_rendement_data()
        self.stdout.write(self.style.SUCCESS("Generation SYNTH-IA terminee."))
        self.stdout.write(f"  Agronomie: {agro_counts or 'ignoree'}")
        self.stdout.write(f"  Meteo creee: {meteo_count}")
        self.stdout.write(f"  Recoltes: {recolte_counts or 'ignorees'}")
        self.stdout.write(f"  Observations mensuelles IA disponibles: {len(rows)}")

    def _code(self, prefix, secteur_code, index):
        cleaned = "".join(ch for ch in str(secteur_code).upper() if ch.isalnum())[:10] or f"S{index}"
        return f"{prefix}-{cleaned}-{index:02d}"[:30]
