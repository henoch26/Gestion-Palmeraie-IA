from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from secteurs.models import Secteur
from plantations.services import ContexteAgronomiqueService
from plantations.models import (
    LotPepiniere,
    LotSemence,
    ObservationSanitaire,
    OperationPlantation,
    SuiviCroissance,
    SuiviPepiniere,
)


class PlantationsModelsTest(TestCase):
    def setUp(self):
        self.secteur = Secteur.objects.create(
            code="SEC_PLANT",
            nom="Secteur Plantation",
            superficie_ha=10,
            age_moyen_plants=0,
            nb_palmiers=0,
        )
        self.semence = LotSemence.objects.create(
            variete="Tenera",
            fournisseur="CNRA",
            date_acquisition=date(2026, 1, 10),
            nombre_graines=1000,
            nombre_graines_germees=850,
        )
        self.pepiniere = LotPepiniere.objects.create(
            lot_semence=self.semence,
            date_entree=date(2026, 2, 1),
            nombre_plants_initial=850,
            nombre_plants_valides=800,
            nombre_plants_rejetes=20,
            nombre_plants_morts=30,
        )

    def test_lot_semence_genere_code_et_taux_germination(self):
        self.assertTrue(self.semence.code_lot.startswith("SEM-2026"))
        self.assertEqual(float(self.semence.taux_germination), 85.0)

    def test_lot_pepiniere_calcule_taux_survie(self):
        self.assertTrue(self.pepiniere.code_lot.startswith("PEP-2026"))
        self.assertEqual(self.pepiniere.taux_survie, 94.12)

    def test_operation_plantation_relit_toute_l_origine(self):
        operation = OperationPlantation.objects.create(
            secteur=self.secteur,
            lot_pepiniere=self.pepiniere,
            date_plantation=date(2026, 12, 15),
            nombre_plants=500,
            age_plants_mois=10,
        )

        self.assertTrue(operation.code_operation.startswith("PLA-2026"))
        self.assertEqual(float(operation.densite_plantation), 50.0)
        self.assertEqual(operation.lot_pepiniere.lot_semence.variete, "Tenera")

    def test_suivis_croissance_et_sanitaire_sont_lies_au_secteur(self):
        operation = OperationPlantation.objects.create(
            secteur=self.secteur,
            lot_pepiniere=self.pepiniere,
            date_plantation=date(2026, 12, 15),
            nombre_plants=500,
        )
        croissance = SuiviCroissance.objects.create(
            secteur=self.secteur,
            operation_plantation=operation,
            date_observation=date(2027, 3, 15),
            hauteur_moyenne_cm=80,
            etat_general="bon",
        )
        sanitaire = ObservationSanitaire.objects.create(
            secteur=self.secteur,
            operation_plantation=operation,
            date_observation=date(2027, 4, 15),
            type_probleme="Jaunissement feuilles",
            gravite="moyenne",
        )

        self.assertEqual(croissance.operation_plantation, operation)
        self.assertEqual(sanitaire.operation_plantation, operation)
        self.assertEqual(operation.suivis_croissance.count(), 1)
        self.assertEqual(operation.observations_sanitaires.count(), 1)


class PlantationsAPITest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="api_plant", password="pass12345")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.secteur = Secteur.objects.create(
            code="SEC_API",
            nom="Secteur API",
            superficie_ha=20,
        )

    def test_creer_chaine_semence_pepiniere_plantation_par_api(self):
        semence_resp = self.client.post("/api/semences/", {
            "variete": "Tenera API",
            "fournisseur": "Fournisseur API",
            "date_acquisition": "2026-01-10",
            "nombre_graines": 1000,
            "nombre_graines_germees": 900,
            "statut": "germination",
        }, format="json")
        self.assertEqual(semence_resp.status_code, 201, semence_resp.data)
        self.assertEqual(semence_resp.data["created_by"], self.user.id)
        self.assertEqual(float(semence_resp.data["taux_germination"]), 90.0)

        pepiniere_resp = self.client.post("/api/pepinieres/", {
            "lot_semence": semence_resp.data["id"],
            "date_entree": "2026-02-01",
            "nombre_plants_initial": 900,
            "nombre_plants_valides": 860,
            "statut": "en_cours",
        }, format="json")
        self.assertEqual(pepiniere_resp.status_code, 201, pepiniere_resp.data)
        self.assertEqual(pepiniere_resp.data["lot_semence_code"], semence_resp.data["code_lot"])

        plantation_resp = self.client.post("/api/plantations/", {
            "secteur": self.secteur.id,
            "lot_pepiniere": pepiniere_resp.data["id"],
            "date_plantation": "2026-12-15",
            "nombre_plants": 1000,
            "age_plants_mois": 10,
            "statut": "realisee",
        }, format="json")
        self.assertEqual(plantation_resp.status_code, 201, plantation_resp.data)
        self.assertEqual(plantation_resp.data["secteur_code"], "SEC_API")
        self.assertEqual(plantation_resp.data["lot_semence_code"], semence_resp.data["code_lot"])
        self.assertEqual(float(plantation_resp.data["densite_plantation"]), 50.0)

        historique_resp = self.client.get(f"/api/plantations/{plantation_resp.data['id']}/historique/")
        self.assertEqual(historique_resp.status_code, 200)
        self.assertEqual(historique_resp.data["lot_semence"]["code_lot"], semence_resp.data["code_lot"])

    def test_creer_suivi_pepiniere_api(self):
        semence = LotSemence.objects.create(
            variete="Tenera",
            date_acquisition=date(2026, 1, 10),
            nombre_graines=100,
        )
        pepiniere = LotPepiniere.objects.create(
            lot_semence=semence,
            date_entree=date(2026, 2, 1),
            nombre_plants_initial=100,
        )
        resp = self.client.post("/api/suivis-pepiniere/", {
            "lot_pepiniere": pepiniere.id,
            "date_observation": "2026-03-01",
            "nombre_plants_vivants": 95,
            "taille_moyenne_cm": "12.50",
            "etat_sanitaire": "Bon",
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(SuiviPepiniere.objects.count(), 1)

class ContexteAgronomiqueServiceTest(TestCase):
    def setUp(self):
        self.secteur = Secteur.objects.create(
            code="SEC_CTX",
            nom="Secteur Contexte",
            superficie_ha=10,
            age_moyen_plants=1,
            nb_palmiers=500,
            rendement_cible_t_ha=15,
        )
        self.semence = LotSemence.objects.create(
            variete="Tenera",
            fournisseur="CNRA",
            origine="La Me",
            certification="Certifie",
            date_acquisition=date(2026, 1, 10),
            nombre_graines=1000,
            nombre_graines_germees=900,
        )
        self.pepiniere = LotPepiniere.objects.create(
            lot_semence=self.semence,
            date_entree=date(2026, 2, 1),
            nombre_plants_initial=900,
            nombre_plants_valides=855,
            nombre_plants_morts=20,
            nombre_plants_rejetes=25,
        )
        self.operation = OperationPlantation.objects.create(
            secteur=self.secteur,
            lot_pepiniere=self.pepiniere,
            date_plantation=date(2026, 12, 15),
            nombre_plants=500,
            age_plants_mois=10,
            statut="suivi",
        )
        SuiviCroissance.objects.create(
            secteur=self.secteur,
            operation_plantation=self.operation,
            date_observation=date(2027, 3, 15),
            hauteur_moyenne_cm=90,
            nombre_feuilles_moyen=9,
            mortalite=5,
            plants_remplaces=3,
            etat_general="bon",
        )
        ObservationSanitaire.objects.create(
            secteur=self.secteur,
            operation_plantation=self.operation,
            date_observation=date(2027, 4, 15),
            type_probleme="Jaunissement feuilles",
            gravite="elevee",
            surface_touchee_ha=1.25,
            statut="en_traitement",
        )

    def test_construit_memoire_agronomique_complete(self):
        contexte = ContexteAgronomiqueService().construire_pour_secteur(
            self.secteur,
            date(2027, 6, 15),
        )

        self.assertEqual(contexte["secteur"]["code"], "SEC_CTX")
        self.assertEqual(contexte["operation_plantation"]["code_operation"], self.operation.code_operation)
        self.assertEqual(contexte["lot_pepiniere"]["code_lot"], self.pepiniere.code_lot)
        self.assertEqual(contexte["lot_semence"]["code_lot"], self.semence.code_lot)
        self.assertEqual(contexte["indicateurs"]["age_plantation_mois"], 6)
        self.assertEqual(contexte["indicateurs"]["age_estime_plants_mois"], 16)
        self.assertEqual(contexte["indicateurs"]["taux_germination"], 90.0)
        self.assertEqual(contexte["indicateurs"]["taux_survie_pepiniere"], 95.0)
        self.assertEqual(contexte["indicateurs"]["nb_alertes_sanitaires_ouvertes"], 1)
        self.assertGreaterEqual(contexte["scores"]["confiance_contexte"], 80)

    def test_signale_les_donnees_agronomiques_manquantes(self):
        secteur = Secteur.objects.create(
            code="SEC_CTX_EMPTY",
            nom="Secteur Sans Historique",
            superficie_ha=5,
        )

        contexte = ContexteAgronomiqueService().construire_pour_secteur(
            secteur,
            date(2027, 6, 15),
        )

        self.assertIsNone(contexte["operation_plantation"])
        self.assertIn("operation_plantation", contexte["donnees_manquantes"])
        self.assertIn("secteur.age_moyen_plants", contexte["donnees_manquantes"])
        self.assertIn("secteur.nb_palmiers", contexte["donnees_manquantes"])


class ContexteAgronomiqueAPITest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="api_ctx", password="pass12345")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.secteur = Secteur.objects.create(
            code="SEC_CTX_API",
            nom="Secteur Contexte API",
            superficie_ha=20,
            age_moyen_plants=1,
            nb_palmiers=1000,
            rendement_cible_t_ha=14,
        )
        self.semence = LotSemence.objects.create(
            variete="Tenera API",
            fournisseur="CNRA",
            date_acquisition=date(2026, 1, 10),
            nombre_graines=1000,
            nombre_graines_germees=880,
        )
        self.pepiniere = LotPepiniere.objects.create(
            lot_semence=self.semence,
            date_entree=date(2026, 2, 1),
            nombre_plants_initial=880,
            nombre_plants_valides=840,
        )
        self.operation = OperationPlantation.objects.create(
            secteur=self.secteur,
            lot_pepiniere=self.pepiniere,
            date_plantation=date(2026, 12, 15),
            nombre_plants=1000,
            age_plants_mois=10,
        )
        SuiviCroissance.objects.create(
            secteur=self.secteur,
            operation_plantation=self.operation,
            date_observation=date(2027, 2, 15),
            etat_general="moyen",
        )

    def test_consulter_contexte_agronomique_api(self):
        resp = self.client.get(
            f"/api/contextes-agronomiques/{self.secteur.id}/?date_reference=2027-06-15"
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["secteur"]["code"], "SEC_CTX_API")
        self.assertEqual(resp.data["lot_semence"]["code_lot"], self.semence.code_lot)
        self.assertEqual(resp.data["indicateurs"]["age_plantation_mois"], 6)
        self.assertIn("confiance_contexte", resp.data["scores"])

    def test_rejette_date_reference_invalide(self):
        resp = self.client.get("/api/contextes-agronomiques/?date_reference=15-06-2027")

        self.assertEqual(resp.status_code, 400)
        self.assertIn("date_reference", resp.data["detail"])
