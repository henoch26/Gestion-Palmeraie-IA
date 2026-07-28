"""
services/ml_pipeline.py - Pipeline de pretraitement et d'evaluation des modeles ML.

Fonctionnalites :
  - Normalisation (StandardScaler) et encodage des features
  - Feature engineering (interactions, ratios)
  - Validation croisee a 5 plis
  - Calcul des metriques regression (RMSE, MAE, R2) et classification (Accuracy, Precision, Recall, F1)
  - Sauvegarde et chargement des modeles via Joblib
  - Calcul d'importance des features
"""
import os
import logging
import joblib
import numpy as np
from datetime import datetime
from django.conf import settings

logger = logging.getLogger(__name__)

FEATURES_REGRESSION = [
    "annee", "mois", "secteur_id", "superficie_ha",
    "age_moyen_plants", "nb_palmiers", "rendement_cible",
    "temperature_moy", "precipitation_mm", "humidite_pct",
    "densite_ha", "pluvio_norm",
    "age_reel_plantation_mois", "age_reel_plants_mois",
    "pluie_cumulee_3_mois", "pluie_cumulee_6_mois",
    "humidite_moyenne_3_mois", "temperature_moyenne_3_mois",
    # "ratio_rendement_cible" est derive de quantite_totale (= TARGET_REGRESSION) :
    # l'inclure ici fuiterait la cible dans les features. Il reste reserve a la classification.
]

FEATURES_ANOMALIE = [
    "annee", "mois", "secteur_id", "superficie_ha",
    "age_moyen_plants", "nb_palmiers", "rendement_cible",
    "temperature_moy", "precipitation_mm", "humidite_pct",
    "quantite_totale",
    "densite_ha", "ratio_rendement_cible", "pluvio_norm",
]

TARGET_REGRESSION = "quantite_totale"
TARGET_CLASSIFICATION = "is_anomaly"

def _to_array(rows, feature_cols, target_col=None):
    """Convertit une liste de dicts en matrices numpy X (et optionnellement y)."""
    X = np.array([[float(r.get(c, 0) or 0) for c in feature_cols] for r in rows])
    if target_col:
        y = np.array([float(r.get(target_col, 0) or 0) for r in rows])
        return X, y
    return X


def _add_features(rows):
    """Feature engineering : ajoute des colonnes dérivées."""
    enhanced = []
    for r in rows:
        r2 = dict(r)
        nb = max(r.get("nb_palmiers", 1), 1)
        sup = max(r.get("superficie_ha", 1), 1)
        # Densité palmiers/ha
        r2["densite_ha"] = nb / sup
        # Ratio rendement / cible
        cible = max(r.get("rendement_cible", 1), 1)
        r2["ratio_rendement_cible"] = r.get("quantite_totale", 0) / (nb * cible / 10 + 1)
        # Indice pluviométrie normalisée
        r2["pluvio_norm"] = min(1.0, r.get("precipitation_mm", 0) / 200)
        age_moyen_mois = float(r.get("age_moyen_plants", 10) or 10) * 12
        if r2.get("age_reel_plantation_mois") is None:
            r2["age_reel_plantation_mois"] = age_moyen_mois
        if r2.get("age_reel_plants_mois") is None:
            r2["age_reel_plants_mois"] = age_moyen_mois

        precipitation = float(r.get("precipitation_mm", 100) or 100)
        if r2.get("pluie_cumulee_3_mois") is None:
            r2["pluie_cumulee_3_mois"] = precipitation * 3
        if r2.get("pluie_cumulee_6_mois") is None:
            r2["pluie_cumulee_6_mois"] = precipitation * 6
        if r2.get("humidite_moyenne_3_mois") is None:
            r2["humidite_moyenne_3_mois"] = float(r.get("humidite_pct", 75) or 75)
        if r2.get("temperature_moyenne_3_mois") is None:
            r2["temperature_moyenne_3_mois"] = float(r.get("temperature_moy", 27) or 27)
        enhanced.append(r2)
    return enhanced


def preprocess(rows, feature_cols, target_col=None, scaler=None, fit_scaler=True):
    """
    Prétraitement complet : feature engineering + normalisation.
    Retourne (X_scaled, y, scaler) ou (X_scaled, scaler) si target_col est None.
    """
    from sklearn.preprocessing import StandardScaler

    rows = _add_features(rows)
    if target_col:
        X, y = _to_array(rows, feature_cols, target_col)
    else:
        X = _to_array(rows, feature_cols)
        y = None

    # Remplacer NaN/Inf éventuels
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    if scaler is None:
        scaler = StandardScaler()
    if fit_scaler:
        X_scaled = scaler.fit_transform(X)
    else:
        X_scaled = scaler.transform(X)

    if y is not None:
        return X_scaled, y, scaler
    return X_scaled, scaler


def cross_validate_regression(model_cls, rows, feature_cols, n_splits=5, **model_kwargs):
    """Validation croisée à 5 plis pour la régression. Retourne les métriques moyennes."""
    from sklearn.model_selection import KFold
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)
    data = list(rows)
    indices = list(range(len(data)))

    rmses, maes, r2s = [], [], []

    for train_idx, val_idx in kf.split(indices):
        train = [data[i] for i in train_idx]
        val   = [data[i] for i in val_idx]

        X_train, y_train, scaler = preprocess(train, feature_cols, TARGET_REGRESSION)
        X_val, _                 = preprocess(val, feature_cols, scaler=scaler, fit_scaler=False)
        y_val = np.array([float(r.get(TARGET_REGRESSION, 0) or 0) for r in _add_features(val)])

        model = model_cls(**model_kwargs)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_val)

        rmses.append(np.sqrt(mean_squared_error(y_val, y_pred)))
        maes.append(mean_absolute_error(y_val, y_pred))
        r2s.append(r2_score(y_val, y_pred))

    return {
        "rmse": float(np.mean(rmses)),
        "mae":  float(np.mean(maes)),
        "r2":   float(np.mean(r2s)),
        "rmse_std": float(np.std(rmses)),
        "r2_std":   float(np.std(r2s)),
    }


def cross_validate_classification(model_cls, rows, feature_cols, n_splits=5, **model_kwargs):
    """Validation croisée à 5 plis pour la classification."""
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

    data = list(rows)
    labels = [r.get(TARGET_CLASSIFICATION, 0) for r in data]

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    accs, precs, recs, f1s = [], [], [], []

    for train_idx, val_idx in skf.split(data, labels):
        train = [data[i] for i in train_idx]
        val   = [data[i] for i in val_idx]

        X_train, y_train, scaler = preprocess(train, feature_cols, TARGET_CLASSIFICATION)
        X_val, _                 = preprocess(val, feature_cols, scaler=scaler, fit_scaler=False)
        y_val = np.array([float(r.get(TARGET_CLASSIFICATION, 0)) for r in val])

        model = model_cls(**model_kwargs)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_val)

        accs.append(accuracy_score(y_val, y_pred))
        precs.append(precision_score(y_val, y_pred, zero_division=0))
        recs.append(recall_score(y_val, y_pred, zero_division=0))
        f1s.append(f1_score(y_val, y_pred, zero_division=0))

    return {
        "accuracy":  float(np.mean(accs)),
        "precision": float(np.mean(precs)),
        "recall":    float(np.mean(recs)),
        "f1":        float(np.mean(f1s)),
    }


def save_model(model, scaler, filename_base):
    """Sauvegarde le modèle et son scaler dans MEDIA_ROOT/ia_models/."""
    save_dir = os.path.join(settings.MEDIA_ROOT, "ia_models")
    os.makedirs(save_dir, exist_ok=True)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_path  = os.path.join(save_dir, f"{filename_base}_{ts}.joblib")
    scaler_path = os.path.join(save_dir, f"{filename_base}_{ts}_scaler.joblib")

    joblib.dump(model,  model_path)
    joblib.dump(scaler, scaler_path)
    logger.info("Modèle sauvegardé : %s", model_path)
    return model_path, scaler_path


def load_model(model_path):
    """Charge un modèle Joblib depuis le chemin donné."""
    return joblib.load(model_path)


def load_scaler(model_path):
    """Charge le scaler associé à un modèle (convention : _scaler.joblib)."""
    scaler_path = model_path.replace(".joblib", "_scaler.joblib")
    if not os.path.exists(scaler_path):
        # Fallback : chemin du fichier media
        base = os.path.splitext(model_path)[0]
        scaler_path = f"{base}_scaler.joblib"
    if os.path.exists(scaler_path):
        return joblib.load(scaler_path)
    return None


def get_feature_importances(model, feature_cols):
    """Retourne l'importance des features si le modèle la supporte."""
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        importances = np.abs(model.coef_).flatten()
    else:
        return {}

    total = sum(importances) or 1
    return {col: float(imp / total) for col, imp in zip(feature_cols, importances)}


# Objectif de fiabilité documenté au chapitre 3 du mémoire (R² >= 0.75).
# Non bloquant : sert uniquement à afficher un niveau de fiabilité comparé à
# cet objectif, jamais à empêcher l'utilisation d'un modèle plus faible.
OBJECTIF_R2_MEMOIRE = 0.75


def niveau_fiabilite(r2):
    """Compare le R² d'un modèle à l'objectif du mémoire, sans jamais bloquer son usage."""
    if r2 is None:
        return "inconnu"
    if r2 >= OBJECTIF_R2_MEMOIRE:
        return "eleve"
    if r2 >= 0.5:
        return "modere"
    return "faible"
