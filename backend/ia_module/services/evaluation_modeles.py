"""
Evaluation temporelle des modeles de prediction de rendement.

Le backtesting entraine un modele sur les observations avant la periode de test,
puis compare les predictions aux valeurs reelles sur une periode gardee a part.
"""
import math
from collections import defaultdict

import numpy as np

from .data_collector import DataCollector
from .ml_pipeline import (
    FEATURES_REGRESSION,
    TARGET_REGRESSION,
    get_feature_importances,
    niveau_fiabilite,
    preprocess,
)


DEFAULT_TEST_START = "2024-01"
DEFAULT_TEST_END = None
MIN_TRAIN_OBSERVATIONS = 30


def _period(row):
    return int(row.get("annee") or 0), int(row.get("mois") or 0)


def _period_label(year, month):
    return f"{int(year):04d}-{int(month):02d}"


def _parse_period(value, default=None):
    if value in (None, ""):
        value = default
    if value in (None, ""):
        return None

    try:
        year_text, month_text = str(value).split("-", 1)
        year = int(year_text)
        month = int(month_text)
    except (TypeError, ValueError):
        raise ValueError("La periode doit etre au format YYYY-MM.")

    if month < 1 or month > 12:
        raise ValueError("Le mois de la periode doit etre compris entre 01 et 12.")
    return year, month


def _regression_metrics(y_true, y_pred):
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    errors = np.abs(y_true - y_pred)

    non_zero = y_true != 0
    mape = None
    if np.any(non_zero):
        mape = float(np.mean(errors[non_zero] / np.abs(y_true[non_zero])) * 100)

    r2 = None
    if len(y_true) >= 2:
        score = float(r2_score(y_true, y_pred))
        r2 = score if math.isfinite(score) else None

    return {
        "rmse": float(math.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": r2,
        "mape": mape,
        "precision_moyenne_pct": max(0.0, 100.0 - mape) if mape is not None else None,
    }


class EvaluationModeles:
    """Construit un rapport de backtesting pour les modeles de rendement."""

    def _algorithms(self):
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.linear_model import LinearRegression

        return {
            "linear_regression": {
                "nom": "Regression Lineaire",
                "class": LinearRegression,
                "kwargs": {},
            },
            "random_forest": {
                "nom": "Random Forest Regressor",
                "class": RandomForestRegressor,
                "kwargs": {"n_estimators": 100, "random_state": 42, "n_jobs": -1},
            },
        }

    def evaluer_rendement(self, algorithmes=None, test_start=DEFAULT_TEST_START, test_end=DEFAULT_TEST_END):
        rows = sorted(DataCollector().collect_rendement_data(), key=_period)
        if not rows:
            raise ValueError("Aucune donnee reelle de rendement n'est disponible.")
        return self.evaluer_lignes_rendement(
            rows,
            algorithmes=algorithmes,
            test_start=test_start,
            test_end=test_end,
        )

    def evaluer_lignes_rendement(self, rows, algorithmes=None, test_start=DEFAULT_TEST_START, test_end=DEFAULT_TEST_END):
        rows = sorted([dict(row) for row in rows], key=_period)
        if not rows:
            raise ValueError("Aucune observation de rendement n'est disponible pour l'evaluation.")

        first_period = _period(rows[0])
        last_period = _period(rows[-1])
        start = _parse_period(test_start, DEFAULT_TEST_START)
        end = _parse_period(test_end) or last_period

        if end < start:
            raise ValueError("La fin de test doit etre posterieure ou egale au debut de test.")

        train_rows = [r for r in rows if _period(r) < start]
        test_rows = [r for r in rows if start <= _period(r) <= end]

        if len(train_rows) < MIN_TRAIN_OBSERVATIONS:
            raise ValueError(
                f"Le jeu d'entrainement contient {len(train_rows)} observation(s), "
                f"minimum requis : {MIN_TRAIN_OBSERVATIONS}."
            )
        if not test_rows:
            raise ValueError("Aucune observation reelle n'est disponible sur la periode de test.")

        available = self._algorithms()
        selected = self._normalize_algorithms(algorithmes, available)
        secteur_labels = self._secteur_labels(rows)

        resultats = [
            self._evaluer_algorithme(code, available[code], train_rows, test_rows, secteur_labels)
            for code in selected
        ]
        meilleur = max(
            resultats,
            key=lambda item: item["metriques"].get("r2") if item["metriques"].get("r2") is not None else float("-inf"),
        )

        return {
            "periode_donnees": {
                "debut": _period_label(*first_period),
                "fin": _period_label(*last_period),
                "observations": len(rows),
                "nb_secteurs": len({r.get("secteur_id") for r in rows}),
            },
            "split": {
                "train_start": _period_label(*first_period),
                "train_end": self._previous_month_label(start),
                "test_start": _period_label(*start),
                "test_end": _period_label(*end),
                "train_observations": len(train_rows),
                "test_observations": len(test_rows),
            },
            "nb_features": len(FEATURES_REGRESSION),
            "resultats": resultats,
            "meilleur": meilleur,
        }

    def _normalize_algorithms(self, algorithmes, available):
        if not algorithmes:
            return ["random_forest", "linear_regression"]
        if isinstance(algorithmes, str):
            algorithmes = [a.strip() for a in algorithmes.split(",") if a.strip()]

        unknown = [a for a in algorithmes if a not in available]
        if unknown:
            raise ValueError(f"Algorithme(s) non evaluable(s) : {', '.join(unknown)}.")
        return list(dict.fromkeys(algorithmes))

    def _evaluer_algorithme(self, code, config, train_rows, test_rows, secteur_labels):
        X_train, y_train, scaler = preprocess(train_rows, FEATURES_REGRESSION, TARGET_REGRESSION)
        X_test, _ = preprocess(test_rows, FEATURES_REGRESSION, scaler=scaler, fit_scaler=False)
        y_test = np.array([float(r.get(TARGET_REGRESSION, 0) or 0) for r in test_rows], dtype=float)

        model = config["class"](**config["kwargs"])
        model.fit(X_train, y_train)
        y_pred = np.maximum(0, model.predict(X_test))

        metriques = _regression_metrics(y_test, y_pred)
        importances = get_feature_importances(model, FEATURES_REGRESSION)

        return {
            "algorithme": code,
            "nom": config["nom"],
            "type_tache": "regression",
            "metriques": {
                **metriques,
                "niveau_fiabilite": niveau_fiabilite(metriques.get("r2")),
                "test_observations": len(test_rows),
                "train_observations": len(train_rows),
            },
            "features": FEATURES_REGRESSION,
            "importances": importances,
            "points_mensuels": self._monthly_points(test_rows, y_pred),
            "details": self._details(test_rows, y_pred, secteur_labels),
        }

    def _monthly_points(self, test_rows, y_pred):
        grouped = defaultdict(lambda: {"reel": 0.0, "predit": 0.0, "observations": 0})
        for row, pred in zip(test_rows, y_pred):
            key = _period(row)
            grouped[key]["reel"] += float(row.get(TARGET_REGRESSION, 0) or 0)
            grouped[key]["predit"] += float(pred)
            grouped[key]["observations"] += 1

        points = []
        for (year, month), values in sorted(grouped.items()):
            reel = values["reel"]
            predit = values["predit"]
            erreur = abs(reel - predit)
            erreur_pct = (erreur / reel * 100) if reel else None
            points.append({
                "periode": _period_label(year, month),
                "annee": year,
                "mois": month,
                "reel": round(reel, 2),
                "predit": round(predit, 2),
                "erreur": round(erreur, 2),
                "erreur_pct": round(erreur_pct, 2) if erreur_pct is not None else None,
                "observations": values["observations"],
            })
        return points

    def _details(self, test_rows, y_pred, secteur_labels):
        details = []
        for row, pred in zip(test_rows, y_pred):
            reel = float(row.get(TARGET_REGRESSION, 0) or 0)
            erreur = abs(reel - float(pred))
            erreur_pct = (erreur / reel * 100) if reel else None
            secteur_id = row.get("secteur_id")
            label = secteur_labels.get(secteur_id, {})
            details.append({
                "periode": _period_label(row["annee"], row["mois"]),
                "annee": int(row["annee"]),
                "mois": int(row["mois"]),
                "secteur_id": secteur_id,
                "secteur_code": label.get("code") or f"Secteur {secteur_id}",
                "secteur_nom": label.get("nom") or "",
                "reel": round(reel, 2),
                "predit": round(float(pred), 2),
                "erreur": round(erreur, 2),
                "erreur_pct": round(erreur_pct, 2) if erreur_pct is not None else None,
            })
        return details

    def _secteur_labels(self, rows):
        try:
            from secteurs.models import Secteur

            ids = {r.get("secteur_id") for r in rows if r.get("secteur_id")}
            secteurs = Secteur.objects.filter(pk__in=ids).values("id", "code", "nom")
            return {s["id"]: {"code": s["code"], "nom": s["nom"]} for s in secteurs}
        except Exception:
            return {}

    def _previous_month_label(self, period):
        year, month = period
        if month == 1:
            return _period_label(year - 1, 12)
        return _period_label(year, month - 1)