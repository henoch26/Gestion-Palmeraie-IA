"""
Tests unitaires des modèles ModeleIA, Prediction, Anomalie, DonneeMeteo.
"""
from django.test import TestCase
from django.contrib.auth.models import User


class ModeleIATest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("testadmin", password="pass")

    def test_creation_modele(self):
        from ia_module.models import ModeleIA
        m = ModeleIA.objects.create(
            nom="Test LR v1",
            algorithme="linear_regression",
            type_tache="regression",
            version=1,
            metriques={"rmse": 10.5, "mae": 7.2, "r2": 0.82},
            features=["annee", "mois", "secteur_id"],
            nb_observations=150,
            actif=True,
            created_by=self.user,
        )
        self.assertEqual(m.nom, "Test LR v1")
        self.assertEqual(m.algorithme, "linear_regression")
        self.assertTrue(m.actif)
        self.assertEqual(str(m), "Test LR v1 v1 (Régression Linéaire)")

    def test_metriques_json(self):
        from ia_module.models import ModeleIA
        m = ModeleIA.objects.create(
            nom="RF Test",
            algorithme="random_forest",
            type_tache="regression",
            metriques={"rmse": 8.3, "r2": 0.91},
            features=[],
        )
        self.assertAlmostEqual(m.metriques["r2"], 0.91)

    def test_str_representation(self):
        from ia_module.models import ModeleIA
        m = ModeleIA(nom="IF v1", algorithme="isolation_forest", type_tache="anomalie", version=2)
        self.assertIn("Isolation Forest", str(m))


class PredictionTest(TestCase):
    def setUp(self):
        from ia_module.models import ModeleIA
        self.modele = ModeleIA.objects.create(
            nom="RF Test", algorithme="random_forest",
            type_tache="regression", metriques={}, features=[],
        )

    def test_creation_prediction(self):
        from ia_module.models import Prediction
        p = Prediction.objects.create(
            modele=self.modele,
            annee_cible=2025,
            mois_cible=6,
            valeur_predite=1250,
            intervalle_bas=1100,
            intervalle_haut=1400,
            features_utilisees={"mois": 6},
        )
        self.assertEqual(p.annee_cible, 2025)
        self.assertIsNone(p.erreur_absolue)

    def test_erreur_absolue(self):
        from ia_module.models import Prediction
        p = Prediction(valeur_predite=1000, valeur_reelle=900)
        self.assertAlmostEqual(p.erreur_absolue, 100.0)

    def test_erreur_none_sans_reelle(self):
        from ia_module.models import Prediction
        p = Prediction(valeur_predite=1000, valeur_reelle=None)
        self.assertIsNone(p.erreur_absolue)


class AnomalieTest(TestCase):
    def test_creation_anomalie(self):
        from ia_module.models import Anomalie
        a = Anomalie.objects.create(
            type_anomalie="recolte",
            criticite="elevee",
            statut="nouvelle",
            description="Test anomalie",
            valeur_observee=500,
            valeur_reference=300,
            ecart_pct=66.7,
            methode_detection="regles_metier",
        )
        self.assertEqual(a.statut, "nouvelle")
        self.assertEqual(a.criticite, "elevee")
        # __str__ utilise le code, pas le libellé
        self.assertIn("elevee", str(a).lower())

    def test_str_anomalie(self):
        from ia_module.models import Anomalie
        a = Anomalie(
            type_anomalie="rendement", criticite="critique",
            statut="validee", description="x",
            valeur_observee=0, valeur_reference=0, ecart_pct=0,
        )
        s = str(a)
        self.assertIn("rendement", s.lower())


class DonneeMeteoTest(TestCase):
    def test_creation_meteo(self):
        from ia_module.models import DonneeMeteo
        from datetime import date
        d = DonneeMeteo.objects.create(
            date=date(2025, 6, 15),
            temperature_max=35.0,
            temperature_min=24.0,
            temperature_moy=29.5,
            precipitation_mm=12.5,
            humidite_pct=82.0,
        )
        self.assertEqual(d.date.year, 2025)
        self.assertAlmostEqual(d.temperature_moy, 29.5)

    def test_unique_date_secteur(self):
        """unique_together est appliqué quand secteur est non-NULL (PostgreSQL ignore NULL dans les contraintes)."""
        from ia_module.models import DonneeMeteo
        from secteurs.models import Secteur
        from django.db import IntegrityError, transaction
        from datetime import date
        sec = Secteur.objects.create(code="S99", nom="Test unique", superficie_ha=5)
        DonneeMeteo.objects.create(date=date(2025, 2, 1), secteur=sec)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DonneeMeteo.objects.create(date=date(2025, 2, 1), secteur=sec)
