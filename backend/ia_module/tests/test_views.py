"""
Tests d'intégration des endpoints API IA.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from accounts.models import UserProfile


def create_admin(username="admin_ia", password="pass123"):
    user = User.objects.create_user(username=username, password=password)
    UserProfile.objects.get_or_create(user=user, defaults={"role": "admin"})
    profile = user.profile
    profile.role = "admin"
    profile.save()
    return user


def create_superviseur(username="sup_ia", password="pass123"):
    user = User.objects.create_user(username=username, password=password)
    UserProfile.objects.get_or_create(user=user, defaults={"role": "superviseur"})
    return user


class ModeleIAViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin()
        self.client.force_authenticate(user=self.admin)

    def test_list_modeles_vide(self):
        response = self.client.get("/api/ia/modeles/")
        self.assertIn(response.status_code, [200])
        data = response.json()
        results = data if isinstance(data, list) else data.get("results", [])
        self.assertIsInstance(results, list)

    def test_list_modeles_non_authentifie(self):
        client2 = APIClient()
        response = client2.get("/api/ia/modeles/")
        self.assertEqual(response.status_code, 401)


class PredictionViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin()
        self.sup   = create_superviseur()

    def test_list_predictions_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ia/predictions/")
        self.assertEqual(response.status_code, 200)

    def test_list_predictions_superviseur(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.get("/api/ia/predictions/")
        self.assertEqual(response.status_code, 200)

    def test_predire_sans_modele_retourne_404(self):
        from secteurs.models import Secteur
        Secteur.objects.create(code="SEC01", nom="Test", superficie_ha=10)
        sec = Secteur.objects.first()
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/ia/predire-rendement/", {
            "secteur_id":  sec.pk,
            "annee_cible": 2025,
            "mois_cible":  6,
            "algorithme":  "random_forest",
        }, format="json")
        self.assertEqual(response.status_code, 404)

    def test_predire_champs_manquants(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/ia/predire-rendement/", {}, format="json")
        self.assertEqual(response.status_code, 400)


class LatestRegressionModelTest(TestCase):
    """
    _latest_regression_model() doit choisir le modèle actif avec le meilleur
    R², pas le plus récemment entraîné — bug corrigé cette session : avant,
    .latest("date_entrainement") fonctionnait "par chance" (random_forest
    entraîné juste après linear_regression dans entrainer_modeles), sans
    aucune garantie réelle de choisir le meilleur.
    """

    def test_selectionne_le_meilleur_r2_pas_le_plus_recent(self):
        from datetime import timedelta
        from django.utils import timezone
        from ia_module.models import ModeleIA
        from ia_module.views import _latest_regression_model

        # Le modèle le plus ANCIEN a le meilleur R² -> doit quand même être choisi.
        ancien_meilleur = ModeleIA.objects.create(
            nom="Ancien meilleur", algorithme="random_forest", type_tache="regression",
            actif=True, metriques={"r2": 0.55},
        )
        ModeleIA.objects.filter(pk=ancien_meilleur.pk).update(
            date_entrainement=timezone.now() - timedelta(days=1)
        )
        ModeleIA.objects.create(
            nom="Recent mais pire", algorithme="linear_regression", type_tache="regression",
            actif=True, metriques={"r2": 0.20},
        )

        choisi = _latest_regression_model()
        self.assertEqual(choisi.pk, ancien_meilleur.pk)

    def test_ignore_les_modeles_inactifs(self):
        from ia_module.models import ModeleIA
        from ia_module.views import _latest_regression_model

        ModeleIA.objects.create(
            nom="Inactif mais excellent", algorithme="random_forest", type_tache="regression",
            actif=False, metriques={"r2": 0.99},
        )
        actif = ModeleIA.objects.create(
            nom="Actif", algorithme="linear_regression", type_tache="regression",
            actif=True, metriques={"r2": 0.30},
        )
        choisi = _latest_regression_model()
        self.assertEqual(choisi.pk, actif.pk)

    def test_leve_doesnotexist_si_aucun_modele_actif(self):
        from ia_module.models import ModeleIA
        from ia_module.views import _latest_regression_model
        with self.assertRaises(ModeleIA.DoesNotExist):
            _latest_regression_model()


class NiveauFiabiliteTest(TestCase):
    """Le niveau de fiabilité affiché doit être ancré sur l'objectif R² >= 0.75 du mémoire."""

    def test_niveaux(self):
        from ia_module.services.ml_pipeline import OBJECTIF_R2_MEMOIRE, niveau_fiabilite
        self.assertEqual(OBJECTIF_R2_MEMOIRE, 0.75)
        self.assertEqual(niveau_fiabilite(0.80), "eleve")
        self.assertEqual(niveau_fiabilite(0.75), "eleve")
        self.assertEqual(niveau_fiabilite(0.60), "modere")
        self.assertEqual(niveau_fiabilite(0.50), "modere")
        self.assertEqual(niveau_fiabilite(0.30), "faible")
        self.assertEqual(niveau_fiabilite(None), "inconnu")


class PredireRendementFiabiliteTest(TestCase):
    """
    La fiabilité doit être visible pour TOUS les rôles — bug corrigé cette
    session : elle était auparavant masquée pour les non-admins (dépendait du
    champ `modele`, lui-même réservé aux admins).
    """

    def setUp(self):
        from ia_module.models import ModeleIA
        from secteurs.models import Secteur
        self.client = APIClient()
        self.admin = create_admin()
        self.sup = create_superviseur()
        self.secteur = Secteur.objects.create(
            code="SECFIAB", nom="Test Fiabilite", superficie_ha=10,
            nb_palmiers=200, age_moyen_plants=10, rendement_cible_t_ha=15,
        )
        ModeleIA.objects.create(
            nom="RF test", algorithme="random_forest", type_tache="regression",
            actif=True, metriques={"r2": 0.55, "rmse": 40.0, "model_path": "fake/path.joblib"},
        )

    def _fake_predict(self, **kwargs):
        return {
            "valeur_predite": 150.0, "intervalle_bas": 90.0, "intervalle_haut": 210.0,
            "features": {"annee": 2025, "mois": 6},
        }

    def test_fiabilite_visible_pour_superviseur_mais_pas_le_detail_modele(self):
        from unittest.mock import patch
        with patch(
            "ia_module.services.predicteur_rendement.PredicteurRendement.predire",
            side_effect=lambda **kwargs: self._fake_predict(**kwargs),
        ):
            self.client.force_authenticate(user=self.sup)
            response = self.client.post("/api/ia/predire-rendement/", {
                "secteur_id": self.secteur.pk, "annee_cible": 2025, "mois_cible": 6,
            }, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("fiabilite", data)
        self.assertEqual(data["fiabilite"]["niveau"], "modere")
        self.assertEqual(data["fiabilite"]["objectif_memoire"], 0.75)
        self.assertIsNone(data["modele"])

    def test_fiabilite_et_detail_modele_pour_admin(self):
        from unittest.mock import patch
        with patch(
            "ia_module.services.predicteur_rendement.PredicteurRendement.predire",
            side_effect=lambda **kwargs: self._fake_predict(**kwargs),
        ):
            self.client.force_authenticate(user=self.admin)
            response = self.client.post("/api/ia/predire-rendement/", {
                "secteur_id": self.secteur.pk, "annee_cible": 2025, "mois_cible": 6,
            }, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn("fiabilite", data)
        self.assertIsNotNone(data["modele"])

    def _creer_chaine_agronomique(self):
        from datetime import date
        from plantations.models import LotPepiniere, LotSemence, OperationPlantation, SuiviCroissance

        semence = LotSemence.objects.create(
            variete="Tenera",
            fournisseur="CNRA",
            certification="Certifie",
            date_acquisition=date(2024, 1, 10),
            nombre_graines=1000,
            nombre_graines_germees=900,
        )
        pepiniere = LotPepiniere.objects.create(
            lot_semence=semence,
            date_entree=date(2024, 2, 1),
            nombre_plants_initial=900,
            nombre_plants_valides=860,
        )
        operation = OperationPlantation.objects.create(
            secteur=self.secteur,
            lot_pepiniere=pepiniere,
            date_plantation=date(2024, 12, 15),
            nombre_plants=200,
            age_plants_mois=10,
        )
        SuiviCroissance.objects.create(
            secteur=self.secteur,
            operation_plantation=operation,
            date_observation=date(2025, 3, 15),
            etat_general="bon",
        )
        return semence, pepiniere, operation

    def test_prediction_rendement_inclut_contexte_agronomique(self):
        from unittest.mock import patch

        semence, _, _ = self._creer_chaine_agronomique()
        with patch(
            "ia_module.services.predicteur_rendement.PredicteurRendement.predire",
            side_effect=lambda **kwargs: self._fake_predict(**kwargs),
        ):
            self.client.force_authenticate(user=self.admin)
            response = self.client.post("/api/ia/predire-rendement/", {
                "secteur_id": self.secteur.pk, "annee_cible": 2025, "mois_cible": 6,
            }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        data = response.json()
        contexte = data["contexte_agronomique"]
        self.assertEqual(contexte["origine"]["lot_semence"], semence.code_lot)
        self.assertEqual(contexte["indicateurs"]["age_plantation_mois"], 6)
        self.assertIn("contexte_agronomique", data["prediction"]["features_utilisees"])
        self.assertIn("contexte_agronomique", data["explication"])

    def test_prediction_plantation_inclut_resume_agronomique_global(self):
        from unittest.mock import patch

        self._creer_chaine_agronomique()
        with patch(
            "ia_module.services.predicteur_rendement.PredicteurRendement.predire",
            side_effect=lambda **kwargs: self._fake_predict(**kwargs),
        ):
            self.client.force_authenticate(user=self.admin)
            response = self.client.post("/api/ia/predire-plantation/", {
                "annee_cible": 2025, "mois_cible": 6,
            }, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        data = response.json()
        self.assertEqual(data["contexte_agronomique"]["scope"], "plantation")
        self.assertEqual(data["contexte_agronomique"]["nb_secteurs"], 1)
        self.assertIn("contexte_agronomique", data["prediction"]["features_utilisees"])
        self.assertIn("contexte_agronomique", data["predictions_secteurs"][0]["features"])

class AnomalieViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin()
        self.sup   = create_superviseur()

    def test_list_anomalies(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ia/anomalies/")
        self.assertEqual(response.status_code, 200)

    def test_detecter_regles_metier(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/ia/detecter-anomalie/",
                                    {"methode": "regles_metier"}, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total", data)
        self.assertIn("anomalies_detectees", data)

    def test_detecter_interdit_superviseur(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.post("/api/ia/detecter-anomalie/",
                                    {"methode": "regles_metier"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_valider_anomalie(self):
        from ia_module.models import Anomalie
        a = Anomalie.objects.create(
            type_anomalie="recolte", criticite="moyenne", statut="nouvelle",
            description="Test", valeur_observee=100, valeur_reference=80, ecart_pct=25,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/ia/anomalies/{a.pk}/valider/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        a.refresh_from_db()
        self.assertEqual(a.statut, "validee")

    def test_rejeter_anomalie(self):
        from ia_module.models import Anomalie
        a = Anomalie.objects.create(
            type_anomalie="rendement", criticite="faible", statut="nouvelle",
            description="Test rejet", valeur_observee=50, valeur_reference=100, ecart_pct=50,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/ia/anomalies/{a.pk}/rejeter/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        a.refresh_from_db()
        self.assertEqual(a.statut, "rejetee")

    def test_filtre_statut(self):
        from ia_module.models import Anomalie
        Anomalie.objects.create(
            type_anomalie="recolte", criticite="faible", statut="validee",
            description="v", valeur_observee=1, valeur_reference=1, ecart_pct=0,
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ia/anomalies/?statut=validee")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        results = data if isinstance(data, list) else data.get("results", [])
        self.assertTrue(all(r["statut"] == "validee" for r in results))


class EntrainerViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin()
        self.sup   = create_superviseur()

    def test_entrainer_interdit_superviseur(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.post("/api/ia/entrainer/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_entrainer_algo_inconnu(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/ia/entrainer/",
                                    {"algorithmes": ["algo_inexistant"]}, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["erreurs"]), 1)
        self.assertIn("inconnu", data["erreurs"][0]["erreur"].lower())


class DonneeMeteoViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin()

    def test_list_meteo_vide(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ia/meteo/")
        self.assertEqual(response.status_code, 200)

    def test_meteo_non_authentifie(self):
        response = APIClient().get("/api/ia/meteo/")
        self.assertEqual(response.status_code, 401)


class MetierIAViewTest(TestCase):
    def setUp(self):
        from secteurs.models import Secteur
        self.client = APIClient()
        self.admin = create_admin("admin_metier")
        self.sup = create_superviseur("sup_metier")
        self.secteur = Secteur.objects.create(
            code="S-MET",
            nom="Secteur metier",
            superficie_ha=10,
            rendement_cible_t_ha=12,
            age_moyen_plants=8,
            nb_palmiers=220,
        )

    def test_synthese_metier_superviseur(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.get("/api/ia/synthese/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("actions_prioritaires", data)
        self.assertIn("modules", data)
        self.assertEqual(data["contexte"]["role"], "superviseur")

    def test_simulation_sans_secteur(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.post("/api/ia/simulation/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_simulation_retourne_scenario(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.post("/api/ia/simulation/", {
            "secteur_id": self.secteur.pk,
            "annee_cible": 2026,
            "mois_cible": 7,
            "nb_recolteurs": 8,
            "nb_heures": 7,
            "frequence_cycle_jours": 15,
            "niveau_entretien": 70,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("rendement_simule", data)
        self.assertIn("actions", data)

    def test_creer_prescription(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post("/api/ia/prescriptions/", {
            "secteur_id": self.secteur.pk,
            "annee_cible": 2026,
            "mois_cible": 8,
            "objectif_regimes": 1500,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["secteur_code"], "S-MET")
        self.assertGreater(data["nb_recolteurs_recommande"], 0)

    def test_risques_secteurs_retourne_scores(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ia/risques-secteurs/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("resume", data)
        self.assertIn("secteurs", data)
        self.assertGreaterEqual(data["total"], 1)
        self.assertIn("score_risque", data["secteurs"][0])
        self.assertIn("plan_equipe", data["secteurs"][0])

    def test_plan_equipe_retourne_recommandation(self):
        self.client.force_authenticate(user=self.sup)
        response = self.client.post("/api/ia/plan-equipe/", {
            "secteur_id": self.secteur.pk,
            "annee_cible": 2026,
            "mois_cible": 8,
            "objectif_regimes": 1200,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["secteur"]["code"], "S-MET")
        self.assertGreater(data["plan"]["nb_recolteurs"], 0)


class EvaluationModelesViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.sup = create_superviseur("sup_eval")

    def test_evaluation_modeles_superviseur(self):
        from unittest.mock import patch

        payload = {
            "periode_donnees": {"debut": "2014-01", "fin": "2026-06", "observations": 1319, "nb_secteurs": 9},
            "split": {"train_start": "2014-01", "train_end": "2023-12", "test_start": "2024-01", "test_end": "2026-06", "train_observations": 1000, "test_observations": 319},
            "resultats": [],
            "meilleur": {"algorithme": "random_forest", "metriques": {"r2": 0.8}, "points_mensuels": []},
        }

        with patch("ia_module.services.evaluation_modeles.EvaluationModeles.evaluer_rendement", return_value=payload) as mocked:
            self.client.force_authenticate(user=self.sup)
            response = self.client.get("/api/ia/evaluation-modeles/?test_start=2024-01&test_end=2026-06")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["split"]["train_end"], "2023-12")
        self.assertEqual(data["meilleur"]["algorithme"], "random_forest")
        self.assertEqual(mocked.call_args.kwargs["test_start"], "2024-01")
        self.assertEqual(mocked.call_args.kwargs["test_end"], "2026-06")

    def test_evaluation_modeles_non_authentifie(self):
        response = APIClient().get("/api/ia/evaluation-modeles/")
        self.assertEqual(response.status_code, 401)