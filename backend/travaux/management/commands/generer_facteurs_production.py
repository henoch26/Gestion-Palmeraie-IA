"""
management command : generer_facteurs_production.py

Complète le jeu de données synthétiques avec les facteurs agronomiques qui
influencent réellement la production, en plus du cycle de récolte et de la
saisonnalité déjà corrigés par `fix_donnees_realistes` :

  1. Un parc matériel minimal (MaterielEquipement), inexistant jusqu'ici.
  2. Un historique de fiches de travaux (FicheTravaux) sur 12 ans par secteur
     (fertilisation, désherbage, traitement phytosanitaire, taille/ablation)
     + quelques fiches transverses (recensement, entretien voie).
  3. Un ajustement des quantités déjà présentes dans FicheRecolteDetail pour
     qu'elles corrèlent avec l'âge des palmiers, la taille du secteur, son
     rendement cible et son historique de travaux récent — au lieu d'être
     tirées uniformément comme avant. C'est une influence *indirecte* :
     aucun champ ni feature du module IA n'est modifié, seule la donnée
     générée devient cohérente avec les features déjà utilisées par
     ia_module (age_moyen_plants, nb_palmiers, rendement_cible_t_ha).
  4. Une réconciliation des FicheRecuVente : l'ajustement des quantités
     (étape 3) change le volume total récolté par fiche, donc les reçus
     déjà calculés par `fix_donnees_realistes` (pesee_kg/montant basés sur
     l'ancien volume) deviennent incohérents — cette étape les recalcule
     sur le volume actuel, avec la même logique (poids moyen 15-25kg/régime,
     prix officiel 80-140 FCFA/kg selon l'année).

Usage :
  python manage.py generer_facteurs_production --dry-run
  python manage.py generer_facteurs_production
  python manage.py generer_facteurs_production --seed 123

Idempotence : les FicheTravaux générées portent un marqueur déterministe
dans `periode_travaux` (ex. "AUTO|GP_1|fertilisation|2016-03-12") — un
rerun retrouve les fiches déjà créées via get_or_create et ne les recrée
pas. Les fiches de travaux déjà présentes en base avant ce script (créées
manuellement, ids 1-10) ne sont ni lues ni modifiées. L'ajustement des
quantités de récolte est recalculé à chaque run à partir d'un
random.Random() seedé par détail — le résultat final est donc stable.
"""
import random
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Avg, Max, Min, Sum
from django.utils import timezone

RAINY_MONTHS = {4, 5, 6, 7, 10, 11}
DRY_MONTHS = {12, 1, 2, 3}

MATERIEL_CATALOGUE = [
    {"numero": 101, "designation": "Camion benne Isuzu", "categorie": "vehicule",
     "quantite": 1, "valeur_achat": Decimal("18000000"), "fournisseur": "CFAO Motors"},
    {"numero": 102, "designation": "Tracteur agricole Massey Ferguson", "categorie": "equipement_lourd",
     "quantite": 1, "valeur_achat": Decimal("12500000"), "fournisseur": "SIFCA Equipements"},
    {"numero": 103, "designation": "Remorque agricole", "categorie": "equipement_lourd",
     "quantite": 2, "valeur_achat": Decimal("2200000"), "fournisseur": "SIFCA Equipements"},
    {"numero": 104, "designation": "Pulvérisateur à dos motorisé", "categorie": "outil",
     "quantite": 4, "valeur_achat": Decimal("350000"), "fournisseur": "Quincaillerie Abidjan"},
    {"numero": 105, "designation": "Tronçonneuse Stihl", "categorie": "outil",
     "quantite": 3, "valeur_achat": Decimal("450000"), "fournisseur": "Quincaillerie Abidjan"},
    {"numero": 106, "designation": "Sécateurs de taille", "categorie": "petit_materiel",
     "quantite": 10, "valeur_achat": Decimal("15000"), "fournisseur": "Quincaillerie Abidjan"},
    {"numero": 107, "designation": "Houes et machettes", "categorie": "petit_materiel",
     "quantite": 20, "valeur_achat": Decimal("8000"), "fournisseur": "Quincaillerie Abidjan"},
    {"numero": 108, "designation": "Débroussailleuse thermique", "categorie": "equipement_lourd",
     "quantite": 2, "valeur_achat": Decimal("650000"), "fournisseur": "CFAO Motors"},
    {"numero": 109, "designation": "Pick-up Toyota Hilux", "categorie": "vehicule",
     "quantite": 1, "valeur_achat": Decimal("16000000"), "fournisseur": "CFAO Motors"},
]

# nature_travaux -> (occurrences/an, duree_jours, [consommable(s)], categories_materiel_ok)
PLAN_ANNUEL_SECTEUR = {
    "fertilisation": {
        "occurrences": (1, 1), "duree": (1, 1),
        "consommable": ("Engrais NPK 12-12-17", "sacs 50kg", (15000, 20000), lambda sup, rng: round(sup * rng.uniform(3, 5), 1)),
        "materiel_categories": ["vehicule", "equipement_lourd"],
    },
    "desherbage": {
        "occurrences": (1, 2), "duree": (1, 2),
        "consommable": None,  # majoritairement manuel
        "materiel_categories": ["outil", "petit_materiel"],
    },
    "traitement_phytosanitaire": {
        "occurrences": (0, 1), "duree": (1, 1),
        "consommable": ("Produit phytosanitaire (fongicide/insecticide)", "litres", (8000, 15000), lambda sup, rng: round(sup * rng.uniform(0.5, 1.5), 2)),
        "materiel_categories": ["outil"],
    },
    "taille_ablation": {
        "occurrences": (1, 1), "duree": (2, 3),
        "consommable": ("Carburant tronçonneuse", "litres", (700, 900), lambda sup, rng: round(rng.uniform(5, 15), 1)),
        "materiel_categories": ["outil"],
    },
}
NATURE_TO_TYPE = {
    "fertilisation": "fertilisation",
    "desherbage": "desherbage",
    "traitement_phytosanitaire": "traitement",
    "taille_ablation": "taille",
    "recensement": "recensement",
    "entretien_voie": "entretien_voie",
}


class Command(BaseCommand):
    help = (
        "Génère un historique de fiches de travaux + un parc matériel minimal, "
        "et corrèle les quantités de récolte avec l'âge des palmiers, la taille "
        "du secteur, son rendement cible et son historique de travaux récent."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--seed", type=int, default=42)

    def handle(self, *args, **options):
        from django.contrib.auth.models import User
        from materiels.models import MaterielEquipement
        from recolteurs.models import Personnel
        from recoltes.models import Client, FicheRecolte, FicheRecolteDetail, FicheRecuVente
        from secteurs.models import Secteur
        from travaux.models import FicheTravaux

        self.seed = options["seed"]

        self.stdout.write(self.style.SUCCESS("=== AUDIT AVANT ==="))
        self._audit(FicheTravaux, MaterielEquipement, FicheRecolteDetail, Secteur, FicheRecuVente)

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("\n--dry-run : aucune écriture effectuée."))
            return

        with transaction.atomic():
            admin = User.objects.filter(is_superuser=True).first() or User.objects.first()
            secteurs = list(Secteur.objects.order_by("id"))
            personnel = list(Personnel.objects.order_by("id"))
            bounds = FicheRecolte.objects.aggregate(mn=Min("date"), mx=Max("date"))
            date_debut, date_fin = bounds["mn"], bounds["mx"]

            self._creer_materiel(MaterielEquipement)
            materiel_par_categorie = self._materiel_par_categorie(MaterielEquipement)
            fertil_dates, desherbage_dates = self._generer_travaux(
                FicheTravaux, secteurs, personnel, materiel_par_categorie, admin, date_debut, date_fin
            )
            self._ajuster_quantites_recolte(FicheRecolteDetail, secteurs, fertil_dates, desherbage_dates, date_fin)
            self._recalculer_recus_vente(FicheRecuVente, FicheRecolteDetail, FicheRecolte, Client, admin)

        self.stdout.write(self.style.SUCCESS("\n=== AUDIT APRÈS ==="))
        self._audit(FicheTravaux, MaterielEquipement, FicheRecolteDetail, Secteur, FicheRecuVente)

    # ------------------------------------------------------------------ #
    def _audit(self, FicheTravaux, MaterielEquipement, FicheRecolteDetail, Secteur, FicheRecuVente):
        from recoltes.models import FicheRecolte

        self.stdout.write(f"FicheTravaux : {FicheTravaux.objects.count()}")
        self.stdout.write(f"MaterielEquipement : {MaterielEquipement.objects.count()}")
        self.stdout.write("Quantité moyenne par secteur (age / nb_palmiers / rendement_cible) :")
        for s in Secteur.objects.order_by("id"):
            avg_q = FicheRecolteDetail.objects.filter(secteur=s).aggregate(a=Avg("quantite"))["a"]
            avg_q = round(avg_q, 1) if avg_q is not None else None
            self.stdout.write(
                f"  {s.code:10s} age={s.age_moyen_plants!s:>3} nb_palmiers={s.nb_palmiers!s:>4} "
                f"rendement_cible={s.rendement_cible_t_ha!s:>6} -> quantite_moy_detail={avg_q}"
            )

        # Cohérence reçu <-> volume actuel de la fiche (poids moyen attendu 15-25kg/régime)
        incoherents = 0
        n_recus = FicheRecuVente.objects.count()
        for f in FicheRecolte.objects.filter(statut="valide").prefetch_related("recus"):
            recu = f.recus.first()
            if not recu:
                continue
            total_regimes = FicheRecolteDetail.objects.filter(ligne__fiche=f).aggregate(s=Sum("quantite"))["s"] or 0
            if total_regimes == 0:
                continue
            poids_moyen_implicite = float(recu.pesee_kg) / total_regimes
            if not (13 <= poids_moyen_implicite <= 28):
                incoherents += 1
        self.stdout.write(f"Reçus incohérents avec le volume actuel de leur fiche : {incoherents} / {n_recus}")

    # ------------------------------------------------------------------ #
    def _creer_materiel(self, MaterielEquipement):
        for m in MATERIEL_CATALOGUE:
            obj, created = MaterielEquipement.objects.get_or_create(
                numero=m["numero"],
                defaults={
                    "designation": m["designation"],
                    "categorie": m["categorie"],
                    "quantite": m["quantite"],
                    "etat_physique": "Bon état",
                    "statut_utilisation": "Disponible",
                    "valeur_achat": m["valeur_achat"],
                    "fournisseur": m["fournisseur"],
                    "date_acquisition": date(2014, 1, 15),
                    "localisation": "Siège d'exploitation",
                    "responsable": "Chef de parc matériel",
                },
            )
            if created:
                self.stdout.write(f"  [+] Matériel créé : #{m['numero']} {m['designation']}")

    def _materiel_par_categorie(self, MaterielEquipement):
        out = {}
        for m in MaterielEquipement.objects.all():
            out.setdefault(m.categorie, []).append(m)
        return out

    # ------------------------------------------------------------------ #
    def _generer_travaux(self, FicheTravaux, secteurs, personnel, materiel_par_categorie, admin, date_debut, date_fin):
        from materiels.models import MaterielUtiliseTravaux
        from travaux.models import ConsommableTravaux, RepartitionTache

        fertil_dates = {s.id: [] for s in secteurs}
        desherbage_dates = {s.id: [] for s in secteurs}
        n_created = 0

        for annee in range(date_debut.year, date_fin.year + 1):
            for secteur in secteurs:
                # RNG dédié UNIQUEMENT au calendrier (dates/durées) : son
                # déroulé ne doit jamais dépendre de ce qui est créé ou non,
                # sinon un rerun où tout existe déjà décale les tirages
                # suivants et regénère un calendrier différent (non idempotent).
                rng_planning = random.Random(f"{self.seed}:planning:{secteur.id}:{annee}")
                pool = [p for p in personnel if p.created_at.date().year <= annee] or personnel[:3]

                for nature, plan in PLAN_ANNUEL_SECTEUR.items():
                    n_occ = rng_planning.randint(*plan["occurrences"])
                    for _ in range(n_occ):
                        jour = rng_planning.randint(1, 365)
                        duree = rng_planning.randint(*plan["duree"])
                        try:
                            d_debut = date(annee, 1, 1) + timedelta(days=jour - 1)
                        except ValueError:
                            continue
                        if not (date_debut <= d_debut <= date_fin):
                            continue
                        d_fin = d_debut + timedelta(days=duree - 1)
                        # Marqueur interne (jamais affiché) utilisé uniquement pour
                        # seeder le RNG de contenu de façon deterministe et unique
                        # par fiche — periode_travaux, lui, reste un texte lisible.
                        marqueur = f"AUTO|{secteur.code}|{nature}|{d_debut.isoformat()}"

                        # RNG dédié au contenu de CETTE fiche, seedé par son
                        # marqueur unique : totalement indépendant du RNG de
                        # planning, donc son usage (ou non-usage, si la fiche
                        # existe déjà) n'affecte jamais le calendrier.
                        rng_contenu = random.Random(f"{self.seed}:contenu:{marqueur}")
                        nb_personnes = rng_contenu.randint(2, 6)

                        # Idempotence basée sur (date_debut, nature, secteur) — jamais
                        # sur periode_travaux, qui doit rester un texte lisible par
                        # l'utilisateur ("AAAA-MM-JJ - AAAA-MM-JJ"), pas un marqueur technique.
                        existante = FicheTravaux.objects.filter(
                            date_debut=d_debut, nature_travaux=nature, secteurs_couverts=secteur,
                        ).first()
                        if existante:
                            fiche, created = existante, False
                        else:
                            fiche = FicheTravaux.objects.create(
                                periode_travaux=f"{d_debut.isoformat()} - {d_fin.isoformat()}",
                                created_by=admin,
                                statut="valide",
                                validated_by=admin,
                                validated_at=timezone.make_aware(datetime.combine(d_fin, time(17, 0))),
                                superviseur_travaux="Encadrement technique",
                                nature_travaux=nature,
                                type_travaux=NATURE_TO_TYPE[nature],
                                superficie_couverte_ha=secteur.superficie_ha,
                                nb_personnes=nb_personnes,
                                date_debut=d_debut,
                                date_fin=d_fin,
                                statut_avancement="termine",
                                salaire_total=Decimal("0.00"),
                            )
                            created = True

                        if nature == "fertilisation":
                            fertil_dates[secteur.id].append(d_debut)
                        elif nature == "desherbage":
                            desherbage_dates[secteur.id].append(d_debut)

                        if not created:
                            continue

                        n_created += 1
                        fiche.secteurs_couverts.set([secteur])

                        if plan["consommable"]:
                            designation, unite, prix_range, qte_fn = plan["consommable"]
                            ConsommableTravaux.objects.create(
                                fiche=fiche,
                                designation=designation,
                                quantite=Decimal(str(qte_fn(float(secteur.superficie_ha), rng_contenu))),
                                unite=unite,
                                prix_unitaire=Decimal(rng_contenu.randint(*prix_range)),
                            )

                        n_ouvriers = min(rng_contenu.randint(2, 4), len(pool))
                        for ouvrier in rng_contenu.sample(pool, n_ouvriers):
                            RepartitionTache.objects.create(
                                fiche=fiche,
                                nom_prenom=ouvrier.nom,
                                nature_taches=nature.replace("_", " "),
                                quantite=Decimal("1.00"),
                                prix_unitaire=Decimal(rng_contenu.randint(3000, 5000)),
                            )

                        candidats_materiel = []
                        for cat in plan["materiel_categories"]:
                            candidats_materiel.extend(materiel_par_categorie.get(cat, []))
                        if candidats_materiel:
                            materiel = rng_contenu.choice(candidats_materiel)
                            MaterielUtiliseTravaux.objects.get_or_create(
                                materiel=materiel, fiche_travaux=fiche,
                                defaults={"quantite_utilisee": 1},
                            )

        self.stdout.write(f"  Fiches travaux créées : {n_created}")
        return fertil_dates, desherbage_dates

    # ------------------------------------------------------------------ #
    @staticmethod
    def _age_factor(age_now, age_reference_date, fiche_date):
        if age_now is None:
            return 1.0
        years_diff = (age_reference_date - fiche_date).days / 365.25
        age_then = max(float(age_now) - years_diff, 2.0)
        if age_then < 3:
            return 0.35 + (age_then / 3) * 0.15
        if age_then < 8:
            return 0.50 + (age_then - 3) / 5 * 0.50
        if age_then <= 18:
            return 1.0
        if age_then <= 25:
            return 1.0 - (age_then - 18) / 7 * 0.35
        return 0.65

    @staticmethod
    def _travaux_factor(secteur_id, fiche_date, fertil_dates, desherbage_dates):
        bonus = 0.0
        passees = [d for d in fertil_dates.get(secteur_id, []) if d <= fiche_date]
        if passees:
            gap = (fiche_date - max(passees)).days
            if 0 <= gap <= 120:
                bonus = 0.20 * (1 - gap / 120)

        malus = 0.0
        entretenues = [d for d in desherbage_dates.get(secteur_id, []) if d <= fiche_date]
        if entretenues:
            gap = (fiche_date - max(entretenues)).days
            if gap > 180:
                malus = 0.15
        else:
            malus = 0.15
        return max(0.7, 1.0 + bonus - malus)

    def _ajuster_quantites_recolte(self, FicheRecolteDetail, secteurs, fertil_dates, desherbage_dates, age_reference_date):
        avg_nb_palmiers = sum(s.nb_palmiers or 0 for s in secteurs) / len(secteurs)
        avg_rendement = sum(float(s.rendement_cible_t_ha or 0) for s in secteurs) / len(secteurs)
        secteurs_par_id = {s.id: s for s in secteurs}

        n_ajustees = 0
        details = FicheRecolteDetail.objects.select_related("ligne__fiche", "secteur").all()
        for d in details:
            if not d.secteur_id or not d.ligne or not d.ligne.fiche_id:
                continue
            secteur = secteurs_par_id.get(d.secteur_id)
            if secteur is None:
                continue
            fiche_date = d.ligne.fiche.date
            rainy = fiche_date.month in RAINY_MONTHS
            qty_min, qty_max = (15, 40) if rainy else (5, 25)

            age_f = self._age_factor(secteur.age_moyen_plants, age_reference_date, fiche_date)
            size_ratio = (secteur.nb_palmiers or avg_nb_palmiers) / avg_nb_palmiers
            target_ratio = float(secteur.rendement_cible_t_ha or avg_rendement) / avg_rendement
            capacite = (size_ratio * target_ratio) ** 0.5
            travaux_f = self._travaux_factor(secteur.id, fiche_date, fertil_dates, desherbage_dates)
            combined = age_f * capacite * travaux_f

            rng = random.Random(f"{self.seed}:detail:{d.pk}")
            nouvelle_quantite = round(rng.uniform(qty_min, qty_max) * combined)
            nouvelle_quantite = max(5, min(40, nouvelle_quantite))

            if nouvelle_quantite != d.quantite:
                d.quantite = nouvelle_quantite
                d.save(update_fields=["quantite"])
                n_ajustees += 1

        self.stdout.write(f"  Détails de récolte ajustés : {n_ajustees} / {details.count()}")

    # ------------------------------------------------------------------ #
    def _recalculer_recus_vente(self, FicheRecuVente, FicheRecolteDetail, FicheRecolte, Client, admin):
        """Réaligne pesee_kg/montant/prix_officiel de chaque reçu sur le
        volume ACTUEL de sa fiche (l'ajustement des quantités ci-dessus change
        ce volume, donc les reçus calculés par fix_donnees_realistes sur
        l'ancien total deviennent incohérents si on ne les recalcule pas ici)."""
        clients = list(Client.objects.all())
        institutionnels = [c for c in clients if c.nom in {"SAPH", "PALMCI", "OILPALM"}]
        particuliers = [c for c in clients if c.nom not in {"SAPH", "PALMCI", "OILPALM"}]

        fiches = list(FicheRecolte.objects.filter(statut="valide").order_by("id"))
        n_recalcules = 0

        for fiche in fiches:
            rng = random.Random(f"{self.seed}:recu:{fiche.pk}")
            total_regimes = FicheRecolteDetail.objects.filter(ligne__fiche=fiche).aggregate(
                s=Sum("quantite")
            )["s"] or 0

            recu, created = FicheRecuVente.objects.get_or_create(fiche=fiche)

            poids_moyen = rng.uniform(15, 25)
            pesee_kg = Decimal(str(round(total_regimes * poids_moyen * rng.uniform(0.95, 1.05), 2)))

            annee = fiche.date.year
            t = max(0.0, min(1.0, (annee - 2014) / 12))
            prix_officiel_annee = Decimal(str(round(80 + t * (140 - 80), 2)))
            prix_effectif = prix_officiel_annee * Decimal(str(round(rng.uniform(0.92, 1.08), 3)))
            montant = (pesee_kg * prix_effectif).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

            client_obj = recu.client_obj
            if client_obj is None:
                if institutionnels and (total_regimes > 150 or rng.random() < 0.4):
                    client_obj = rng.choice(institutionnels)
                elif particuliers:
                    client_obj = rng.choice(particuliers)

            if created:
                recu_date = fiche.date + timedelta(days=rng.randint(1, 5))
                recu.date = recu_date
                recu.reference_facture = f"FAC-{annee}-{fiche.pk:05d}"
                recu.mode_paiement = "virement" if client_obj in institutionnels else "espece"
                recu.vehicule_transport = (
                    f"Camion {rng.choice(['CI', 'AB', 'YAM'])}-{rng.randint(100, 999)}-{rng.choice(['A', 'B', 'C'])}"
                )
                recu.statut = "valide"
                recu.validated_by = admin
                recu.validated_at = timezone.make_aware(
                    datetime.combine(recu_date, time(rng.randint(8, 17), 0))
                )

            recu.client_obj = client_obj
            recu.client = client_obj.nom if client_obj else ""
            recu.pesee_kg = pesee_kg
            recu.non_conformes_pct = Decimal(str(round(rng.uniform(0, 8), 2)))
            recu.montant = montant
            recu.prix_officiel = prix_officiel_annee
            recu.save()
            n_recalcules += 1

        self.stdout.write(f"  Reçus de vente réconciliés avec le volume actuel : {n_recalcules} / {len(fiches)}")
