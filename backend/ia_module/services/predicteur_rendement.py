"""
services/predicteur_rendement.py — Service de prédiction de rendement.

Entraîne les modèles de régression (Linear Regression et Random Forest)
et expose la méthode predire() pour obtenir des prédictions avec intervalles
de confiance.
"""
import logging

from .data_collector import DataCollector
from .data_generator import DataGenerator
from .ml_pipeline import (
    FEATURES_REGRESSION, TARGET_REGRESSION,
    preprocess, cross_validate_regression,
    save_model, load_model, load_scaler,
    get_feature_importances, _add_features,
)

logger = logging.getLogger(__name__)

MIN_OBSERVATIONS = 30


class PredicteurRendement:
    """Entraîne et utilise les modèles de prédiction de rendement."""

    def _get_training_data(self):
        collector = DataCollector()
        rows = collector.collect_rendement_data()
        if len(rows) < MIN_OBSERVATIONS:
            generator = DataGenerator()
            synthetic = generator.generate_rendement_rows(n=500)
            rows = rows + synthetic
            logger.info(
                "Donnees insuffisantes (%d reelles), ajout de %d synthetiques",
                len(rows) - len(synthetic), len(synthetic),
            )
        return rows

    def entrainer_regression_lineaire(self, user=None):
        """Entraîne un modèle de Régression Linéaire."""
        from sklearn.linear_model import LinearRegression
        return self._entrainer(
            LinearRegression, "linear_regression", "Régression Linéaire", user
        )
    def entrainer_random_forest(self, user=None):
        """Entraîne un Random Forest Regressor."""
        from sklearn.ensemble import RandomForestRegressor
        return self._entrainer(
            RandomForestRegressor, "random_forest", "Random Forest Regressor", user,
            n_estimators=100, random_state=42, n_jobs=-1,
        )
    def _entrainer(self, model_cls, algo_code, algo_name, user=None, **model_kwargs):
        from ia_module.models import ModeleIA

        rows = self._get_training_data()
        logger.info("Entraînement %s sur %d observations", algo_name, len(rows))

        # Validation croisée
        metriques = cross_validate_regression(
            model_cls, rows, FEATURES_REGRESSION, **model_kwargs
        )

        # Entraînement final sur toutes les données
        X, y, scaler = preprocess(rows, FEATURES_REGRESSION, TARGET_REGRESSION)
        model = model_cls(**model_kwargs)
        model.fit(X, y)

        # Sauvegarde
        model_path, _ = save_model(model, scaler, algo_code)

        # Calcul importance features
        importances = get_feature_importances(model, FEATURES_REGRESSION)

        # Version
        version = (
            ModeleIA.objects.filter(algorithme=algo_code).count() + 1
        )

        # Désactiver anciens modèles du même algo
        ModeleIA.objects.filter(algorithme=algo_code, actif=True).update(actif=False)

        # Créer l'enregistrement
        modele_ia = ModeleIA.objects.create(
            nom=f"{algo_name} v{version}",
            algorithme=algo_code,
            type_tache="regression",
            version=version,
            metriques={**metriques, "importances": importances},
            features=FEATURES_REGRESSION,
            nb_observations=len(rows),
            actif=True,
            created_by=user,
        )
        # Sauvegarder le chemin relatif (sans backslash dans f-string pour compat Python < 3.12)
        normalized = model_path.replace("\\", "/")
        ia_idx = normalized.find("ia_models/")
        rel_path = normalized[ia_idx:] if ia_idx >= 0 else normalized.split("/")[-1]
        modele_ia.chemin_fichier.name = rel_path
        # Stocker chemin absolu dans metriques pour faciliter le chargement
        modele_ia.metriques["model_path"] = model_path
        modele_ia.save()

        logger.info("Modèle %s créé (id=%d, RMSE=%.2f, R²=%.3f)",
                    algo_name, modele_ia.pk, metriques["rmse"], metriques["r2"])
        return modele_ia

    def predire(self, modele_ia, secteur_id, annee, mois,
                superficie_ha=10, age_moyen_plants=10, nb_palmiers=200,
                rendement_cible=15, temperature_moy=27, precipitation_mm=100,
                humidite_pct=75, age_reel_plantation_mois=None,
                age_reel_plants_mois=None, pluie_cumulee_3_mois=None,
                pluie_cumulee_6_mois=None, humidite_moyenne_3_mois=None,
                temperature_moyenne_3_mois=None):
        """
        Effectue une prédiction avec intervalles de confiance.
        Retourne (valeur_predite, intervalle_bas, intervalle_haut, features_dict).
        """
        model_path = modele_ia.metriques.get("model_path", "")
        if not model_path:
            raise ValueError("Chemin du modèle manquant.")

        model  = load_model(model_path)
        scaler = load_scaler(model_path)

        row = [{
            "annee":            annee,
            "mois":             mois,
            "secteur_id":       secteur_id,
            "superficie_ha":    superficie_ha,
            "age_moyen_plants": age_moyen_plants,
            "nb_palmiers":      nb_palmiers,
            "rendement_cible":  rendement_cible,
            "temperature_moy":  temperature_moy,
            "precipitation_mm": precipitation_mm,
            "humidite_pct":     humidite_pct,
            "age_reel_plantation_mois": age_reel_plantation_mois,
            "age_reel_plants_mois": age_reel_plants_mois,
            "pluie_cumulee_3_mois": pluie_cumulee_3_mois,
            "pluie_cumulee_6_mois": pluie_cumulee_6_mois,
            "humidite_moyenne_3_mois": humidite_moyenne_3_mois,
            "temperature_moyenne_3_mois": temperature_moyenne_3_mois,
            "quantite_totale":  0,
        }]

        row = _add_features(row)
        X, sc = preprocess(row, FEATURES_REGRESSION, scaler=scaler, fit_scaler=False)
        y_pred = float(model.predict(X)[0])
        y_pred = max(0.0, y_pred)

        # Intervalle de confiance approximatif (±1.5 × RMSE)
        rmse = modele_ia.metriques.get("rmse", y_pred * 0.15)
        margin = 1.5 * rmse
        return {
            "valeur_predite":  round(y_pred, 2),
            "intervalle_bas":  round(max(0, y_pred - margin), 2),
            "intervalle_haut": round(y_pred + margin, 2),
            "features": {
                "annee": annee, "mois": mois, "secteur_id": secteur_id,
                "superficie_ha": superficie_ha, "age_moyen_plants": age_moyen_plants,
                "nb_palmiers": nb_palmiers, "rendement_cible": rendement_cible,
                "temperature_moy": temperature_moy, "precipitation_mm": precipitation_mm,
                "humidite_pct": humidite_pct,
                "age_reel_plantation_mois": row[0].get("age_reel_plantation_mois"),
                "age_reel_plants_mois": row[0].get("age_reel_plants_mois"),
                "pluie_cumulee_3_mois": row[0].get("pluie_cumulee_3_mois"),
                "pluie_cumulee_6_mois": row[0].get("pluie_cumulee_6_mois"),
                "humidite_moyenne_3_mois": row[0].get("humidite_moyenne_3_mois"),
                "temperature_moyenne_3_mois": row[0].get("temperature_moyenne_3_mois"),
            },
        }
