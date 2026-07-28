"""
Tests des services ML : DataGenerator, pipeline de prétraitement,
métriques régression/classification et PredicteurRendement.
"""
from django.test import TestCase


class DataGeneratorTest(TestCase):
    def test_generate_rendement_rows(self):
        from ia_module.services.data_generator import DataGenerator
        gen = DataGenerator()
        rows = gen.generate_rendement_rows(n=50, seed=0)
        self.assertEqual(len(rows), 50)
        # Toutes les features requises sont présentes
        required = ["annee", "mois", "secteur_id", "superficie_ha",
                    "age_moyen_plants", "nb_palmiers", "rendement_cible",
                    "temperature_moy", "precipitation_mm", "humidite_pct",
                    "quantite_totale",
                    "age_reel_plantation_mois", "age_reel_plants_mois",
                    "pluie_cumulee_3_mois", "pluie_cumulee_6_mois",
                    "humidite_moyenne_3_mois", "temperature_moyenne_3_mois"]
        for col in required:
            self.assertIn(col, rows[0], f"Feature manquante : {col}")

    def test_generate_anomalie_rows(self):
        from ia_module.services.data_generator import DataGenerator
        gen = DataGenerator()
        rows = gen.generate_anomalie_rows(n=100, anomalie_rate=0.2, seed=42)
        self.assertEqual(len(rows), 100)
        anomalies = [r for r in rows if r["is_anomaly"] == 1]
        # Taux d'anomalies approximativement dans [5%, 40%]
        self.assertGreater(len(anomalies), 5)
        self.assertLess(len(anomalies), 50)

    def test_quantite_non_negative(self):
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_rendement_rows(n=100)
        for r in rows:
            self.assertGreaterEqual(r["quantite_totale"], 0)


class VariablesAgronomiquesServiceTest(TestCase):
    def test_features_utilisent_age_reel_et_meteo_des_mois_precedents(self):
        from datetime import date
        from ia_module.models import DonneeMeteo
        from ia_module.services.variables_agronomiques import VariablesAgronomiquesService
        from plantations.models import LotPepiniere, LotSemence, OperationPlantation
        from secteurs.models import Secteur

        secteur = Secteur.objects.create(
            code="AGRO",
            nom="Secteur agronomique",
            superficie_ha=10,
            age_moyen_plants=8,
            nb_palmiers=1430,
            rendement_cible_t_ha=12,
        )
        lot_semence = LotSemence.objects.create(
            variete="Tenera",
            fournisseur="Test",
            date_acquisition=date(2021, 1, 1),
            date_mise_en_germination=date(2021, 2, 1),
            nombre_graines=1000,
            nombre_graines_germees=850,
        )
        lot_pepiniere = LotPepiniere.objects.create(
            lot_semence=lot_semence,
            date_entree=date(2021, 3, 1),
            nombre_plants_initial=850,
            nombre_plants_valides=800,
        )
        OperationPlantation.objects.create(
            secteur=secteur,
            lot_pepiniere=lot_pepiniere,
            date_plantation=date(2022, 1, 15),
            nombre_plants=800,
            age_plants_mois=10,
        )
        for mois, pluie, humidite, temp in [
            (1, 10, 71, 25),
            (2, 20, 72, 26),
            (3, 30, 73, 27),
            (4, 40, 74, 28),
            (5, 50, 75, 29),
            (6, 60, 76, 30),
        ]:
            DonneeMeteo.objects.create(
                secteur=secteur,
                date=date(2022, mois, 15),
                precipitation_mm=pluie,
                humidite_pct=humidite,
                temperature_moy=temp,
            )

        features = VariablesAgronomiquesService().features_pour_secteur(secteur, 2022, 7)

        self.assertEqual(features["age_reel_plantation_mois"], 6)
        self.assertEqual(features["age_reel_plants_mois"], 16)
        self.assertEqual(features["pluie_cumulee_3_mois"], 150)
        self.assertEqual(features["pluie_cumulee_6_mois"], 210)
        self.assertEqual(features["humidite_moyenne_3_mois"], 75)
        self.assertEqual(features["temperature_moyenne_3_mois"], 29)

class TestFeaturesModeles(TestCase):
    """Tests d'integration des listes de features simples."""

    def test_features_modeles_sans_doublons(self):
        from ia_module.services.ml_pipeline import FEATURES_ANOMALIE, FEATURES_REGRESSION

        self.assertEqual(len(FEATURES_REGRESSION), len(set(FEATURES_REGRESSION)))
        self.assertEqual(len(FEATURES_ANOMALIE), len(set(FEATURES_ANOMALIE)))
        self.assertEqual(len(FEATURES_REGRESSION), 18)
        self.assertEqual(len(FEATURES_ANOMALIE), 14)

    def test_preprocess_reste_compatible_avec_features_simples(self):
        import numpy as np
        from ia_module.services.data_generator import DataGenerator
        from ia_module.services.ml_pipeline import FEATURES_REGRESSION, preprocess

        rows = DataGenerator().generate_rendement_rows(n=30)
        X, y, scaler = preprocess(rows, FEATURES_REGRESSION, "quantite_totale")

        self.assertEqual(X.shape[0], 30)
        self.assertEqual(X.shape[1], len(FEATURES_REGRESSION))
        self.assertEqual(len(y), 30)
        self.assertIsNotNone(scaler)
        self.assertFalse(np.isnan(X).any())


class MLPipelineTest(TestCase):
    def test_preprocess_returns_correct_shape(self):
        from ia_module.services.ml_pipeline import preprocess, FEATURES_REGRESSION
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_rendement_rows(n=30)
        X, y, scaler = preprocess(rows, FEATURES_REGRESSION, "quantite_totale")
        self.assertEqual(X.shape[0], 30)
        self.assertEqual(len(y), 30)
        self.assertIsNotNone(scaler)

    def test_preprocess_no_nan(self):
        import numpy as np
        from ia_module.services.ml_pipeline import preprocess, FEATURES_REGRESSION
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_rendement_rows(n=20)
        X, y, _ = preprocess(rows, FEATURES_REGRESSION, "quantite_totale")
        self.assertFalse(np.isnan(X).any(), "La matrice X contient des NaN")

    def test_cross_validate_regression_returns_metrics(self):
        from sklearn.linear_model import LinearRegression
        from ia_module.services.ml_pipeline import cross_validate_regression, FEATURES_REGRESSION
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_rendement_rows(n=60)
        metrics = cross_validate_regression(LinearRegression, rows, FEATURES_REGRESSION)
        self.assertIn("rmse", metrics)
        self.assertIn("mae",  metrics)
        self.assertIn("r2",   metrics)
        self.assertGreaterEqual(metrics["rmse"], 0)

    def test_cross_validate_classification_returns_metrics(self):
        from sklearn.tree import DecisionTreeClassifier
        from ia_module.services.ml_pipeline import cross_validate_classification, FEATURES_ANOMALIE
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_anomalie_rows(n=60)
        metrics = cross_validate_classification(DecisionTreeClassifier, rows, FEATURES_ANOMALIE, random_state=42)
        self.assertIn("accuracy",  metrics)
        self.assertIn("precision", metrics)
        self.assertIn("recall",    metrics)
        self.assertIn("f1",        metrics)
        self.assertGreaterEqual(metrics["accuracy"], 0)
        self.assertLessEqual(metrics["accuracy"], 1)

    def test_r2_threshold_random_forest(self):
        """Le Random Forest doit atteindre R² ≥ 0.50 sur données synthétiques."""
        from sklearn.ensemble import RandomForestRegressor
        from ia_module.services.ml_pipeline import cross_validate_regression, FEATURES_REGRESSION
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_rendement_rows(n=200)
        m = cross_validate_regression(
            RandomForestRegressor, rows, FEATURES_REGRESSION,
            n_estimators=50, random_state=42
        )
        self.assertGreaterEqual(m["r2"], 0.50, f"R² trop faible : {m['r2']:.3f}")

    def test_f1_threshold_decision_tree(self):
        """L'arbre de décision doit atteindre F1 ≥ 0.40 sur données synthétiques."""
        from sklearn.tree import DecisionTreeClassifier
        from ia_module.services.ml_pipeline import cross_validate_classification, FEATURES_ANOMALIE
        from ia_module.services.data_generator import DataGenerator
        rows = DataGenerator().generate_anomalie_rows(n=200, anomalie_rate=0.2)
        m = cross_validate_classification(
            DecisionTreeClassifier, rows, FEATURES_ANOMALIE, max_depth=6, random_state=42
        )
        self.assertGreaterEqual(m["f1"], 0.40, f"F1 trop faible : {m['f1']:.3f}")


class PredicteurRendementTest(TestCase):
    def test_predire_sans_modele_leve_exception(self):
        from ia_module.models import ModeleIA
        from ia_module.services.predicteur_rendement import PredicteurRendement
        modele = ModeleIA(metriques={})
        predicteur = PredicteurRendement()
        with self.assertRaises(Exception):
            predicteur.predire(modele, secteur_id=1, annee=2025, mois=6)


class ProductivitePartRecolteurTest(TestCase):
    """
    _productivite_par_recolteur() doit être calculée PAR SECTEUR, pas tous
    secteurs confondus — bug corrigé cette session : un récolteur peut
    travailler sur plusieurs secteurs dans une même fiche, donc mélanger tout
    surestimait fortement ce qu'il produit pour un secteur donné.
    """

    def setUp(self):
        from datetime import date
        from secteurs.models import Secteur
        from recoltes.models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail
        from recolteurs.models import Personnel

        self.secteur_a = Secteur.objects.create(code="PROD_A", nom="Secteur A", superficie_ha=5)
        self.secteur_b = Secteur.objects.create(code="PROD_B", nom="Secteur B", superficie_ha=5)
        self.secteur_vide = Secteur.objects.create(code="PROD_VIDE", nom="Secteur sans historique", superficie_ha=5)
        jean = Personnel.objects.create(nom="Jean Test", lieu_residence="Dabou")

        # 3 fiches : dans CHACUNE, Jean travaille a la fois sur A (40 regimes)
        # et B (100 regimes) -- reproduit exactement le scenario du bug :
        # un recolteur reparti sur plusieurs secteurs dans la meme fiche.
        for i in range(3):
            fiche = FicheRecolte.objects.create(statut="valide", date=date(2025, 1 + i, 15))
            ligne = FicheRecolteLigne.objects.create(fiche=fiche, recolteur=jean, regime_type="grands")
            FicheRecolteDetail.objects.create(ligne=ligne, secteur=self.secteur_a, quantite=40)
            FicheRecolteDetail.objects.create(ligne=ligne, secteur=self.secteur_b, quantite=100)

    def test_productivite_specifique_au_secteur_non_polluee_par_un_autre(self):
        from ia_module.services.aide_decisionnelle import AideDecisionnelleIA
        aide = AideDecisionnelleIA()

        prod_a = aide._productivite_par_recolteur(self.secteur_a)
        prod_b = aide._productivite_par_recolteur(self.secteur_b)

        self.assertAlmostEqual(prod_a, 40.0, delta=0.01)
        self.assertAlmostEqual(prod_b, 100.0, delta=0.01)
        # La production du secteur B (100/fiche) ne doit jamais "polluer" A.
        self.assertLess(prod_a, prod_b)

    def test_repli_sur_la_moyenne_globale_si_secteur_sans_historique(self):
        from ia_module.services.aide_decisionnelle import AideDecisionnelleIA
        aide = AideDecisionnelleIA()

        # Secteur sans aucune donnee recolteur -> repli sur la moyenne globale
        # (140 = 40+100, la somme par fiche tous secteurs confondus), pas sur
        # la constante de dernier recours (80.0).
        prod_vide = aide._productivite_par_recolteur(self.secteur_vide)
        self.assertAlmostEqual(prod_vide, 140.0, delta=0.01)


class VerifierPredictionsCommandTest(TestCase):
    """
    La commande verifier_predictions doit renseigner valeur_reelle pour les
    périodes déjà terminées avec des fiches validées, sans jamais toucher
    aux périodes en cours/futures (sinon on comparerait une prédiction
    complète à une production partielle) ni recalculer une valeur déjà
    connue (idempotence).
    """

    def setUp(self):
        from datetime import date
        from secteurs.models import Secteur
        from recoltes.models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail
        from ia_module.models import Prediction

        self.secteur = Secteur.objects.create(code="VERIF", nom="Secteur verif", superficie_ha=5)

        # Periode PASSEE, avec de vraies fiches validees.
        fiche = FicheRecolte.objects.create(statut="valide", date=date(2020, 3, 10))
        ligne = FicheRecolteLigne.objects.create(fiche=fiche, regime_type="grands")
        FicheRecolteDetail.objects.create(ligne=ligne, secteur=self.secteur, quantite=123)

        self.prediction_passee = Prediction.objects.create(
            secteur=self.secteur, annee_cible=2020, mois_cible=3,
            valeur_predite=100, intervalle_bas=80, intervalle_haut=120,
        )
        self.prediction_future = Prediction.objects.create(
            secteur=self.secteur, annee_cible=2099, mois_cible=1,
            valeur_predite=100, intervalle_bas=80, intervalle_haut=120,
        )

    def test_renseigne_les_periodes_passees_et_ignore_le_futur(self):
        from django.core.management import call_command
        call_command("verifier_predictions")

        self.prediction_passee.refresh_from_db()
        self.prediction_future.refresh_from_db()

        self.assertEqual(self.prediction_passee.valeur_reelle, 123)
        self.assertIsNone(self.prediction_future.valeur_reelle)

    def test_idempotente(self):
        from django.core.management import call_command
        call_command("verifier_predictions")
        self.prediction_passee.refresh_from_db()
        premiere_valeur = self.prediction_passee.valeur_reelle

        # Une deuxième exécution ne doit jamais retoucher une valeur déjà connue.
        call_command("verifier_predictions")
        self.prediction_passee.refresh_from_db()
        self.assertEqual(self.prediction_passee.valeur_reelle, premiere_valeur)


class DetecteurAnomaliesTest(TestCase):
    def test_detecter_sans_donnees(self):
        """Avec une BD vide, la détection retourne une liste vide sans exception."""
        from ia_module.services.detecteur_anomalies import DetecteurAnomalies
        d = DetecteurAnomalies()
        result = d.detecter_par_regles()
        self.assertIsInstance(result, list)

    def test_get_anomalie_data_synthétique(self):
        """Sans données réelles, le générateur synthétique est utilisé."""
        from ia_module.services.detecteur_anomalies import DetecteurAnomalies
        d = DetecteurAnomalies()
        rows = d._get_anomalie_data(labeled=True)
        self.assertGreater(len(rows), 0)
        self.assertIn("is_anomaly", rows[0])


class EvaluationModelesTest(TestCase):
    def _rows(self):
        rows = []
        for annee in range(2014, 2027):
            for mois in range(1, 13):
                if annee == 2026 and mois > 6:
                    continue
                for secteur_id in range(1, 4):
                    quantite = 90 + secteur_id * 20 + (annee - 2014) * 4 + mois * 3
                    rows.append({
                        "annee": annee,
                        "mois": mois,
                        "secteur_id": secteur_id,
                        "superficie_ha": 10 + secteur_id,
                        "age_moyen_plants": 8 + secteur_id,
                        "nb_palmiers": 180 + secteur_id * 10,
                        "rendement_cible": 12,
                        "temperature_moy": 26 + mois * 0.1,
                        "precipitation_mm": 80 + mois,
                        "humidite_pct": 70,
                        "quantite_totale": quantite,
                    })
        return rows

    def test_backtesting_utilise_un_jeu_de_test_temporel_independant(self):
        from unittest.mock import patch
        from ia_module.services.evaluation_modeles import EvaluationModeles

        with patch(
            "ia_module.services.evaluation_modeles.DataCollector.collect_rendement_data",
            return_value=self._rows(),
        ):
            rapport = EvaluationModeles().evaluer_rendement(
                algorithmes=["linear_regression"],
                test_start="2024-01",
                test_end="2024-12",
            )

        self.assertEqual(rapport["split"]["train_end"], "2023-12")
        self.assertEqual(rapport["split"]["test_start"], "2024-01")
        self.assertEqual(rapport["split"]["test_end"], "2024-12")
        self.assertEqual(rapport["split"]["test_observations"], 36)
        self.assertEqual(len(rapport["meilleur"]["points_mensuels"]), 12)
        self.assertEqual(rapport["nb_features"], 18)
        self.assertGreater(rapport["meilleur"]["metriques"]["r2"], 0.95)

    def test_backtesting_refuse_un_algorithme_non_evaluable(self):
        from unittest.mock import patch
        from ia_module.services.evaluation_modeles import EvaluationModeles

        with patch(
            "ia_module.services.evaluation_modeles.DataCollector.collect_rendement_data",
            return_value=self._rows(),
        ):
            with self.assertRaises(ValueError):
                EvaluationModeles().evaluer_rendement(algorithmes=["isolation_forest"])

class GenererBaseTestIACommandTest(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        from recolteurs.models import Personnel
        from secteurs.models import Secteur

        self.admin = User.objects.create_superuser(
            username="admin_base_ia",
            email="admin@example.test",
            password="pass12345",
        )
        self.secteur = Secteur.objects.create(
            code="SYNSEC",
            nom="Secteur synthetique",
            superficie_ha=4,
            age_moyen_plants=10,
            nb_palmiers=560,
            rendement_cible_t_ha=15,
        )
        for idx in range(3):
            Personnel.objects.create(
                nom=f"Recolteur Test {idx}",
                lieu_residence="Village test",
                numero_telephone=f"01000000{idx}",
            )

    def test_genere_base_ia_coherente_et_idempotente(self):
        from io import StringIO
        from django.core.management import call_command
        from ia_module.models import DonneeMeteo
        from ia_module.services.data_collector import DataCollector
        from plantations.models import OperationPlantation
        from recoltes.models import FicheRecolte, FicheRecolteDetail

        call_command(
            "generer_base_test_ia",
            "--debut", "2020",
            "--fin", "2020",
            "--mois-fin", "2",
            "--cycles-par-mois", "1",
            stdout=StringIO(),
        )

        self.assertEqual(FicheRecolte.objects.filter(observations__contains="[SYNTH-IA]").count(), 2)
        self.assertEqual(FicheRecolteDetail.objects.filter(ligne__fiche__observations__contains="[SYNTH-IA]").count(), 2)
        self.assertEqual(DonneeMeteo.objects.filter(source="synthetique_ia").count(), 2)
        self.assertEqual(OperationPlantation.objects.filter(code_operation__startswith="SYN-PLA").count(), 1)
        self.assertEqual(len(DataCollector().collect_rendement_data()), 2)

        counts = (
            FicheRecolte.objects.count(),
            FicheRecolteDetail.objects.count(),
            DonneeMeteo.objects.count(),
            OperationPlantation.objects.count(),
        )
        call_command(
            "generer_base_test_ia",
            "--debut", "2020",
            "--fin", "2020",
            "--mois-fin", "2",
            "--cycles-par-mois", "1",
            stdout=StringIO(),
        )
        self.assertEqual(counts, (
            FicheRecolte.objects.count(),
            FicheRecolteDetail.objects.count(),
            DonneeMeteo.objects.count(),
            OperationPlantation.objects.count(),
        ))


class ExporterMetriquesIACommandTest(TestCase):
    def test_exporte_rapport_et_tableaux_pour_memoire(self):
        import json
        import tempfile
        from io import StringIO
        from pathlib import Path
        from unittest.mock import patch

        from django.core.management import call_command

        from ia_module.models import ModeleIA

        ModeleIA.objects.create(
            nom="Random Forest test",
            algorithme="random_forest",
            type_tache="regression",
            version=1,
            metriques={"r2": 0.91, "rmse": 120.5, "mae": 80.2},
            features=["annee", "mois"],
            nb_observations=42,
            actif=True,
        )
        rapport = {
            "periode_donnees": {
                "debut": "2020-01",
                "fin": "2024-12",
                "observations": 60,
                "nb_secteurs": 2,
            },
            "split": {
                "train_start": "2020-01",
                "train_end": "2023-12",
                "test_start": "2024-01",
                "test_end": "2024-12",
                "train_observations": 48,
                "test_observations": 12,
            },
            "nb_features": 2,
            "resultats": [
                {
                    "algorithme": "random_forest",
                    "nom": "Random Forest Regressor",
                    "type_tache": "regression",
                    "features": ["annee", "mois"],
                    "metriques": {
                        "rmse": 120.5,
                        "mae": 80.2,
                        "r2": 0.91,
                        "mape": 12.3,
                        "precision_moyenne_pct": 87.7,
                        "niveau_fiabilite": "eleve",
                    },
                    "importances": {"annee": 0.8, "mois": 0.2},
                    "points_mensuels": [
                        {
                            "periode": "2024-01",
                            "reel": 1000,
                            "predit": 950,
                            "erreur": 50,
                            "erreur_pct": 5,
                            "observations": 2,
                        }
                    ],
                }
            ],
            "meilleur": {
                "algorithme": "random_forest",
                "nom": "Random Forest Regressor",
                "type_tache": "regression",
                "features": ["annee", "mois"],
                "metriques": {
                    "rmse": 120.5,
                    "mae": 80.2,
                    "r2": 0.91,
                    "mape": 12.3,
                    "precision_moyenne_pct": 87.7,
                    "niveau_fiabilite": "eleve",
                },
                "importances": {"annee": 0.8, "mois": 0.2},
                "points_mensuels": [
                    {
                        "periode": "2024-01",
                        "reel": 1000,
                        "predit": 950,
                        "erreur": 50,
                        "erreur_pct": 5,
                        "observations": 2,
                    }
                ],
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch(
                "ia_module.services.evaluation_modeles.EvaluationModeles.evaluer_rendement",
                return_value=rapport,
            ):
                call_command(
                    "exporter_metriques_ia",
                    "--test-start", "2024-01",
                    "--test-end", "2024-12",
                    "--prefix", "test_export",
                    "--output", tmpdir,
                    stdout=StringIO(),
                )

            output_dir = Path(tmpdir)
            markdown = output_dir / "test_export_rapport.md"
            comparaison_csv = output_dir / "test_export_comparaison_backtesting.csv"
            modeles_csv = output_dir / "test_export_modeles_actifs.csv"
            json_file = output_dir / "test_export_rapport.json"

            self.assertTrue(markdown.exists())
            self.assertTrue(comparaison_csv.exists())
            self.assertTrue(modeles_csv.exists())
            self.assertTrue(json_file.exists())
            self.assertIn("Comparaison des modeles", markdown.read_text(encoding="utf-8"))
            self.assertIn("random_forest", comparaison_csv.read_text(encoding="utf-8-sig"))
            self.assertIn("Random Forest test", modeles_csv.read_text(encoding="utf-8-sig"))
            self.assertEqual(
                json.loads(json_file.read_text(encoding="utf-8"))["resume"]["meilleur_modele"],
                "random_forest",
            )