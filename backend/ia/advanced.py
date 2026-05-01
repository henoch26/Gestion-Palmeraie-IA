from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from django.db.models import Sum

from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
from recolteurs.models import Recolteur
from secteurs.models import Secteur
from .models import FacteurProduction

try:
    from sklearn.ensemble import IsolationForest, RandomForestRegressor
    from sklearn.cluster import KMeans
    from sklearn.inspection import permutation_importance
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler

    SKLEARN_AVAILABLE = True
except Exception:
    SKLEARN_AVAILABLE = False


MONTH_LABELS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]


@dataclass
class Dataset:
    rows: list[dict[str, Any]]
    features: list[str]
    target: str


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return default
        return value
    except Exception:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value or default)
    except Exception:
        return default


def _mean(values: list[float]) -> float:
    values = [v for v in values if v is not None]
    return float(sum(values) / len(values)) if values else 0.0


def _std(values: list[float]) -> float:
    values = [float(v) for v in values if v is not None]
    if len(values) < 2:
        return 0.0
    return float(statistics.pstdev(values))


def _percentile(values: list[float], q: float) -> float:
    values = sorted(float(v) for v in values if v is not None)
    if not values:
        return 0.0
    pos = (len(values) - 1) * q
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return values[lo]
    return values[lo] * (hi - pos) + values[hi] * (pos - lo)


def _month_add(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = (year * 12 + month - 1) + delta
    return idx // 12, (idx % 12) + 1


def _as_matrix(rows: list[dict[str, Any]], features: list[str]) -> list[list[float]]:
    return [[_safe_float(row.get(feature)) for feature in features] for row in rows]


def _accessibilite_score(value: str | None) -> float:
    return {"bonne": 1.0, "moyenne": 0.5, "difficile": 0.0}.get((value or "").strip().lower(), 0.5)


def _factor_defaults() -> dict[str, float]:
    return {
        "has_facteurs_production": 0.0,
        "pluviometrie_mm": 0.0,
        "temperature_moyenne": 0.0,
        "humidite_air_pct": 0.0,
        "jours_secheresse": 0.0,
        "jours_pluie": 0.0,
        "vents_forts": 0.0,
        "humidite_sol_pct": 0.0,
        "ph_sol": 0.0,
        "fertilite_sol_indice": 0.0,
        "drainage_sol_indice": 0.0,
        "age_palmiers_annees": 0.0,
        "jours_depuis_derniere_recolte": 0.0,
        "frequence_recolte_jours": 0.0,
        "desherbage_effectue": 0.0,
        "fertilisation_effectuee": 0.0,
        "traitement_phytosanitaire": 0.0,
        "elagage_effectue": 0.0,
        "engrais_kg": 0.0,
        "pesticide_l": 0.0,
        "herbicide_l": 0.0,
        "cout_intrants_fcfa": 0.0,
        "maladie_detectee": 0.0,
        "niveau_infestation": 0.0,
        "main_oeuvre_disponible": 0.0,
        "absenteisme_pct": 0.0,
        "accessibilite_score": 0.5,
        "distance_collecte_km": 0.0,
        "incident_signale": 0.0,
        "severite_incident": 0.0,
    }


def _factor_to_features(facteur: FacteurProduction | None) -> dict[str, float]:
    values = _factor_defaults()
    if not facteur:
        return values
    values.update(
        {
            "has_facteurs_production": 1.0,
            "pluviometrie_mm": _safe_float(facteur.pluviometrie_mm),
            "temperature_moyenne": _safe_float(facteur.temperature_moyenne),
            "humidite_air_pct": _safe_float(facteur.humidite_air_pct),
            "jours_secheresse": _safe_float(facteur.jours_secheresse),
            "jours_pluie": _safe_float(facteur.jours_pluie),
            "vents_forts": 1.0 if facteur.vents_forts else 0.0,
            "humidite_sol_pct": _safe_float(facteur.humidite_sol_pct),
            "ph_sol": _safe_float(facteur.ph_sol),
            "fertilite_sol_indice": _safe_float(facteur.fertilite_sol_indice),
            "drainage_sol_indice": _safe_float(facteur.drainage_sol_indice),
            "age_palmiers_annees": _safe_float(facteur.age_palmiers_annees),
            "jours_depuis_derniere_recolte": _safe_float(facteur.jours_depuis_derniere_recolte),
            "frequence_recolte_jours": _safe_float(facteur.frequence_recolte_jours),
            "desherbage_effectue": 1.0 if facteur.desherbage_effectue else 0.0,
            "fertilisation_effectuee": 1.0 if facteur.fertilisation_effectuee else 0.0,
            "traitement_phytosanitaire": 1.0 if facteur.traitement_phytosanitaire else 0.0,
            "elagage_effectue": 1.0 if facteur.elagage_effectue else 0.0,
            "engrais_kg": _safe_float(facteur.engrais_kg),
            "pesticide_l": _safe_float(facteur.pesticide_l),
            "herbicide_l": _safe_float(facteur.herbicide_l),
            "cout_intrants_fcfa": _safe_float(facteur.cout_intrants_fcfa),
            "maladie_detectee": 1.0 if facteur.maladie_detectee else 0.0,
            "niveau_infestation": _safe_float(facteur.niveau_infestation),
            "main_oeuvre_disponible": _safe_float(facteur.main_oeuvre_disponible),
            "absenteisme_pct": _safe_float(facteur.absenteisme_pct),
            "accessibilite_score": _accessibilite_score(facteur.accessibilite_secteur),
            "distance_collecte_km": _safe_float(facteur.distance_collecte_km),
            "incident_signale": 1.0 if facteur.incident_signale else 0.0,
            "severite_incident": _safe_float(facteur.severite_incident),
        }
    )
    return values


def _feature_importance_from_model(model: Any, rows: list[dict[str, Any]], features: list[str], target: str) -> list[dict[str, Any]]:
    if not rows:
        return []

    importances = None
    if hasattr(model, "feature_importances_"):
        importances = list(model.feature_importances_)
    elif SKLEARN_AVAILABLE and len(rows) >= 8:
        try:
            x = _as_matrix(rows, features)
            y = [_safe_float(row.get(target)) for row in rows]
            result = permutation_importance(model, x, y, n_repeats=5, random_state=42)
            importances = list(result.importances_mean)
        except Exception:
            importances = None

    if importances is None:
        values = [_safe_float(row.get(target)) for row in rows]
        target_mean = _mean(values)
        target_std = _std(values) or 1.0
        scored = []
        for feature in features:
            xs = [_safe_float(row.get(feature)) for row in rows]
            x_mean = _mean(xs)
            x_std = _std(xs) or 1.0
            cov = sum((x - x_mean) * (y - target_mean) for x, y in zip(xs, values)) / max(1, len(xs))
            scored.append(abs(cov / (x_std * target_std)))
        importances = scored

    total = sum(abs(v) for v in importances) or 1.0
    ranked = [
        {"feature": feature, "importance": round(abs(float(score)) / total, 4)}
        for feature, score in zip(features, importances)
    ]
    return sorted(ranked, key=lambda item: item["importance"], reverse=True)[:8]


def build_monthly_dataset(year: int, secteur_id: int | None = None) -> Dataset:
    details = FicheRecolteDetail.objects.select_related("ligne__fiche", "ligne__recolteur", "secteur")
    if secteur_id:
        details = details.filter(secteur_id=secteur_id)

    facteurs_qs = FacteurProduction.objects.select_related("secteur").filter(year__lte=year)
    if secteur_id:
        facteurs_qs = facteurs_qs.filter(secteur_id=secteur_id)
    facteurs_by_key = {(f.year, f.month, f.secteur_id): f for f in facteurs_qs}

    grouped: dict[tuple[int, int, int | None], dict[str, Any]] = {}
    regime_fields = {"grands": "qty_grands", "moyens": "qty_moyens", "petits": "qty_petits"}

    for detail in details:
        fiche = detail.ligne.fiche
        secteur = detail.secteur
        if not fiche or not secteur:
            continue

        key = (fiche.date.year, fiche.date.month, secteur.id)
        row = grouped.setdefault(
            key,
            {
                "year": fiche.date.year,
                "month": fiche.date.month,
                "secteur_id": secteur.id,
                "secteur_code": secteur.code,
                "secteur_nom": secteur.nom,
                "superficie_ha": _safe_float(secteur.superficie_ha),
                "qty_grands": 0.0,
                "qty_moyens": 0.0,
                "qty_petits": 0.0,
                "total_regimes": 0.0,
                "fiches_count": set(),
                "recolteurs": set(),
                "depenses": 0.0,
            },
        )

        qty = _safe_float(detail.quantite)
        row[regime_fields.get(detail.ligne.regime_type, "qty_grands")] += qty
        row["total_regimes"] += qty
        row["fiches_count"].add(fiche.id)
        if detail.ligne.recolteur_id:
            row["recolteurs"].add(detail.ligne.recolteur_id)
        row["depenses"] += _safe_float(fiche.depense_nourriture) + _safe_float(fiche.depense_transport)

    rows = []
    history_by_sector: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in sorted(grouped.values(), key=lambda item: (item["secteur_id"] or 0, item["year"], item["month"])):
        row["fiches_count"] = len(row["fiches_count"])
        row["recolteurs_count"] = len(row["recolteurs"])
        row.pop("recolteurs", None)
        superficie = row["superficie_ha"] or 0.0
        row["rendement_ha"] = round(row["total_regimes"] / superficie, 4) if superficie else 0.0

        month = int(row["month"])
        row["month_sin"] = math.sin(2 * math.pi * month / 12.0)
        row["month_cos"] = math.cos(2 * math.pi * month / 12.0)
        row["quarter"] = ((month - 1) // 3) + 1
        row["time_index"] = row["year"] * 12 + month
        row["avg_regimes_per_fiche"] = row["total_regimes"] / max(1, row["fiches_count"])
        row["avg_regimes_per_recolteur"] = row["total_regimes"] / max(1, row["recolteurs_count"])
        row["grands_ratio"] = row["qty_grands"] / max(1.0, row["total_regimes"])
        row["moyens_ratio"] = row["qty_moyens"] / max(1.0, row["total_regimes"])
        row["petits_ratio"] = row["qty_petits"] / max(1.0, row["total_regimes"])
        row["depense_par_regime"] = row["depenses"] / max(1.0, row["total_regimes"])
        row.update(_factor_to_features(facteurs_by_key.get((row["year"], row["month"], row["secteur_id"]))))

        history = history_by_sector[int(row["secteur_id"])]
        previous_totals = [h["total_regimes"] for h in history]
        row["rolling_3_total"] = _mean(previous_totals[-3:])
        row["rolling_6_total"] = _mean(previous_totals[-6:])
        row["trend_3"] = row["rolling_3_total"] - _mean(previous_totals[-6:-3])
        row["previous_month_total"] = previous_totals[-1] if previous_totals else 0.0
        row["previous_year_same_month"] = next(
            (h["total_regimes"] for h in reversed(history) if h["month"] == row["month"]),
            0.0,
        )
        history.append(row)
        rows.append(row)

    features = [
        "year",
        "month",
        "quarter",
        "month_sin",
        "month_cos",
        "time_index",
        "superficie_ha",
        "qty_grands",
        "qty_moyens",
        "qty_petits",
        "fiches_count",
        "recolteurs_count",
        "avg_regimes_per_fiche",
        "avg_regimes_per_recolteur",
        "grands_ratio",
        "moyens_ratio",
        "petits_ratio",
        "depense_par_regime",
        "rolling_3_total",
        "rolling_6_total",
        "trend_3",
        "previous_month_total",
        "previous_year_same_month",
        "has_facteurs_production",
        "pluviometrie_mm",
        "temperature_moyenne",
        "humidite_air_pct",
        "jours_secheresse",
        "jours_pluie",
        "vents_forts",
        "humidite_sol_pct",
        "ph_sol",
        "fertilite_sol_indice",
        "drainage_sol_indice",
        "age_palmiers_annees",
        "jours_depuis_derniere_recolte",
        "frequence_recolte_jours",
        "desherbage_effectue",
        "fertilisation_effectuee",
        "traitement_phytosanitaire",
        "elagage_effectue",
        "engrais_kg",
        "pesticide_l",
        "herbicide_l",
        "cout_intrants_fcfa",
        "maladie_detectee",
        "niveau_infestation",
        "main_oeuvre_disponible",
        "absenteisme_pct",
        "accessibilite_score",
        "distance_collecte_km",
        "incident_signale",
        "severite_incident",
    ]
    return Dataset(rows=[row for row in rows if int(row["year"]) <= int(year)], features=features, target="rendement_ha")


def _forecast_feature_row(last_rows: list[dict[str, Any]], year: int, month: int, secteur: Secteur | None) -> dict[str, Any]:
    history = sorted(last_rows, key=lambda item: (item["year"], item["month"]))
    previous_totals = [row["total_regimes"] for row in history]
    last = history[-1] if history else {}
    superficie = _safe_float(getattr(secteur, "superficie_ha", None), _safe_float(last.get("superficie_ha")))
    total_proxy = _mean(previous_totals[-3:]) or _safe_float(last.get("total_regimes"))
    row = {
        "year": year,
        "month": month,
        "quarter": ((month - 1) // 3) + 1,
        "month_sin": math.sin(2 * math.pi * month / 12.0),
        "month_cos": math.cos(2 * math.pi * month / 12.0),
        "time_index": year * 12 + month,
        "superficie_ha": superficie,
        "qty_grands": _safe_float(last.get("qty_grands")),
        "qty_moyens": _safe_float(last.get("qty_moyens")),
        "qty_petits": _safe_float(last.get("qty_petits")),
        "fiches_count": max(1.0, _safe_float(last.get("fiches_count"), 1.0)),
        "recolteurs_count": max(1.0, _safe_float(last.get("recolteurs_count"), 1.0)),
        "avg_regimes_per_fiche": total_proxy / max(1.0, _safe_float(last.get("fiches_count"), 1.0)),
        "avg_regimes_per_recolteur": total_proxy / max(1.0, _safe_float(last.get("recolteurs_count"), 1.0)),
        "grands_ratio": _safe_float(last.get("grands_ratio")),
        "moyens_ratio": _safe_float(last.get("moyens_ratio")),
        "petits_ratio": _safe_float(last.get("petits_ratio")),
        "depense_par_regime": _safe_float(last.get("depense_par_regime")),
        "rolling_3_total": _mean(previous_totals[-3:]),
        "rolling_6_total": _mean(previous_totals[-6:]),
        "trend_3": _mean(previous_totals[-3:]) - _mean(previous_totals[-6:-3]),
        "previous_month_total": previous_totals[-1] if previous_totals else 0.0,
        "previous_year_same_month": next((row["total_regimes"] for row in reversed(history) if row["month"] == month), 0.0),
    }
    factor_values = _factor_defaults()
    factor_values.update({key: _safe_float(last.get(key), value) for key, value in factor_values.items()})
    row.update(factor_values)
    return row


def train_rendement_regression(dataset: Dataset, horizon_months: int = 6, secteur_id: int | None = None) -> dict[str, Any]:
    rows = dataset.rows
    if not rows:
        return {
            "model": "none",
            "metrics": {"n": 0},
            "predictions": [],
            "confidence": 0.0,
            "feature_importance": [],
            "warnings": ["Aucune donnee de recolte exploitable"],
        }

    x = _as_matrix(rows, dataset.features)
    y = [_safe_float(row.get(dataset.target)) for row in rows]
    warnings = []

    if SKLEARN_AVAILABLE and len(rows) >= 8:
        test_size = 0.25 if len(rows) >= 12 else 0.2
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=test_size, shuffle=False)
        model = RandomForestRegressor(
            n_estimators=180,
            max_depth=8,
            min_samples_leaf=2,
            random_state=42,
        )
        model.fit(x_train, y_train)
        y_pred = model.predict(x_test)
        rmse = math.sqrt(mean_squared_error(y_test, y_pred)) if y_test else 0.0
        mae = mean_absolute_error(y_test, y_pred) if y_test else 0.0
        r2 = r2_score(y_test, y_pred) if len(y_test) > 1 else 0.0
        model.fit(x, y)
        algorithm = "random_forest_regressor_v1"
    else:
        baseline = _mean(y)
        model = None
        y_pred = [baseline for _ in y]
        rmse = math.sqrt(sum((actual - baseline) ** 2 for actual in y) / max(1, len(y)))
        mae = sum(abs(actual - baseline) for actual in y) / max(1, len(y))
        r2 = 0.0
        algorithm = "rolling_mean_regressor_fallback"
        if not SKLEARN_AVAILABLE:
            warnings.append("scikit-learn indisponible: fallback statistique utilise")

    last = max(rows, key=lambda item: (item["year"], item["month"]))
    predictions = []
    target_sectors = [Secteur.objects.filter(id=secteur_id).first()] if secteur_id else list(Secteur.objects.all())
    if not any(target_sectors):
        target_sectors = [None]

    for secteur in target_sectors:
        sector_rows = [row for row in rows if not secteur or row.get("secteur_id") == secteur.id]
        if not sector_rows:
            continue
        last_sector = max(sector_rows, key=lambda item: (item["year"], item["month"]))
        for step in range(1, horizon_months + 1):
            yy, mm = _month_add(int(last_sector["year"]), int(last_sector["month"]), step)
            feature_row = _forecast_feature_row(sector_rows, yy, mm, secteur)
            if model is not None:
                pred_rendement = float(model.predict(_as_matrix([feature_row], dataset.features))[0])
            else:
                recent = [row["rendement_ha"] for row in sector_rows[-6:]]
                pred_rendement = _mean(recent)

            pred_rendement = max(0.0, pred_rendement)
            superficie = _safe_float(feature_row.get("superficie_ha"))
            predicted_total = int(round(pred_rendement * superficie)) if superficie else 0
            predictions.append(
                {
                    "year": yy,
                    "month": mm,
                    "label": f"{MONTH_LABELS[mm - 1]} {yy}",
                    "secteur": {
                        "id": getattr(secteur, "id", None),
                        "code": getattr(secteur, "code", None),
                        "nom": getattr(secteur, "nom", None),
                    },
                    "yhat_rendement_ha": round(pred_rendement, 4),
                    "yhat_total_regimes": predicted_total,
                    "confidence": round(max(0.05, min(0.98, 1.0 / (1.0 + (rmse / max(pred_rendement, 1.0))))), 4),
                }
            )

    metrics = {
        "n": len(rows),
        "rmse": round(float(rmse), 4),
        "mae": round(float(mae), 4),
        "r2": round(float(r2), 4),
    }
    confidence = round(max(0.05, min(0.98, (1.0 - min(1.0, metrics["mae"] / max(_mean(y), 1.0))) * min(1.0, len(rows) / 24))), 4)
    return {
        "model": algorithm,
        "metrics": metrics,
        "predictions": predictions,
        "confidence": confidence,
        "feature_importance": _feature_importance_from_model(model, rows, dataset.features, dataset.target),
        "warnings": warnings,
    }


def detect_anomalies_isolation_forest(dataset: Dataset, year: int) -> dict[str, Any]:
    rows = [row for row in dataset.rows if int(row["year"]) == int(year)]
    if not rows:
        return {"model": "none", "items": [], "summary": {"total": 0}, "warnings": ["Aucune donnee pour l'annee demandee"]}

    features = [
        "total_regimes",
        "rendement_ha",
        "depenses",
        "depense_par_regime",
        "recolteurs_count",
        "avg_regimes_per_recolteur",
        "trend_3",
        "previous_year_same_month",
        "pluviometrie_mm",
        "temperature_moyenne",
        "jours_secheresse",
        "humidite_sol_pct",
        "fertilite_sol_indice",
        "jours_depuis_derniere_recolte",
        "engrais_kg",
        "maladie_detectee",
        "niveau_infestation",
        "main_oeuvre_disponible",
        "absenteisme_pct",
        "accessibilite_score",
        "incident_signale",
        "severite_incident",
    ]
    x = _as_matrix(rows, features)
    warnings = []

    if SKLEARN_AVAILABLE and len(rows) >= 8:
        scaler = StandardScaler()
        x_scaled = scaler.fit_transform(x)
        contamination = min(0.25, max(0.05, 1.0 / max(8, len(rows))))
        model = IsolationForest(n_estimators=160, contamination=contamination, random_state=42)
        model.fit(x_scaled)
        raw_scores = [-float(score) for score in model.score_samples(x_scaled)]
        algorithm = "isolation_forest_v1"
    else:
        algorithm = "robust_zscore_fallback"
        warnings.append("IsolationForest indisponible ou historique insuffisant: score robuste utilise")
        columns = list(zip(*x)) if x else []
        means = [_mean(list(col)) for col in columns]
        stds = [_std(list(col)) or 1.0 for col in columns]
        raw_scores = []
        for row_values in x:
            z = [abs((value - mean) / std) for value, mean, std in zip(row_values, means, stds)]
            raw_scores.append(_mean(z))

    min_score = min(raw_scores) if raw_scores else 0.0
    max_score = max(raw_scores) if raw_scores else 1.0
    span = max(max_score - min_score, 1e-9)
    p70 = _percentile(raw_scores, 0.70)
    p90 = _percentile(raw_scores, 0.90)

    items = []
    for row, raw in zip(rows, raw_scores):
        score = (raw - min_score) / span
        if raw >= p90:
            niveau = "eleve"
            classification = "critique"
        elif raw >= p70:
            niveau = "moyen"
            classification = "surveillance"
        else:
            niveau = "faible"
            classification = "normal"

        reasons = []
        if _safe_float(row.get("depense_par_regime")) > _percentile([_safe_float(r.get("depense_par_regime")) for r in rows], 0.75):
            reasons.append("cout par regime au-dessus de la tendance")
        if abs(_safe_float(row.get("trend_3"))) > _std([_safe_float(r.get("trend_3")) for r in rows]):
            reasons.append("rupture de tendance recente")
        if _safe_float(row.get("rendement_ha")) > _percentile([_safe_float(r.get("rendement_ha")) for r in rows], 0.90):
            reasons.append("rendement exceptionnellement eleve")
        if _safe_float(row.get("maladie_detectee")) > 0 or _safe_float(row.get("niveau_infestation")) >= 40:
            reasons.append("pression maladie ou infestation signalee")
        if _safe_float(row.get("jours_secheresse")) >= 10 or _safe_float(row.get("humidite_sol_pct")) <= 25:
            reasons.append("stress hydrique possible")
        if _safe_float(row.get("incident_signale")) > 0 or _safe_float(row.get("severite_incident")) >= 50:
            reasons.append("incident terrain pouvant perturber la production")
        if not reasons:
            reasons.append("ecart multivarie detecte sur les indicateurs de recolte")

        items.append(
            {
                "type": "isolation_forest_recolte_agregee",
                "niveau": niveau,
                "classification": classification,
                "score_anomalie": round(float(score), 4),
                "raw_score": round(float(raw), 4),
                "year": row["year"],
                "month": row["month"],
                "secteur": {"id": row["secteur_id"], "code": row["secteur_code"], "nom": row["secteur_nom"]},
                "metric": "rendement_ha",
                "value": round(_safe_float(row.get("rendement_ha")), 4),
                "reasons": reasons[:3],
                "recommendation": "Verifier la fiche, les depenses et la repartition par recolteur" if classification != "normal" else "Aucune action immediate",
            }
        )

    return {
        "model": algorithm,
        "items": sorted(items, key=lambda item: item["score_anomalie"], reverse=True),
        "summary": {
            "total": len(items),
            "eleve": sum(1 for item in items if item["niveau"] == "eleve"),
            "moyen": sum(1 for item in items if item["niveau"] == "moyen"),
            "faible": sum(1 for item in items if item["niveau"] == "faible"),
        },
        "feature_importance": [{"feature": f, "importance": round(1 / len(features), 4)} for f in features],
        "warnings": warnings,
    }


def cluster_recolteurs(year: int) -> dict[str, Any]:
    rows = []
    totals = (
        FicheRecolteDetail.objects.filter(ligne__fiche__date__year=year, ligne__recolteur__isnull=False)
        .values("ligne__recolteur", "ligne__recolteur__code", "ligne__recolteur__nom")
        .annotate(total_regimes=Sum("quantite"))
    )
    by_recolteur = {row["ligne__recolteur"]: row for row in totals}

    for recolteur in Recolteur.objects.all():
        base = by_recolteur.get(recolteur.id, {})
        monthly = (
            FicheRecolteDetail.objects.filter(ligne__recolteur=recolteur, ligne__fiche__date__year=year)
            .values("ligne__fiche__date__month")
            .annotate(total=Sum("quantite"))
        )
        month_values = [_safe_float(row["total"]) for row in monthly]
        total = _safe_float(base.get("total_regimes"))
        active_months = len([v for v in month_values if v > 0])
        rows.append(
            {
                "recolteur_id": recolteur.id,
                "code": recolteur.code,
                "nom": recolteur.nom,
                "total_regimes": total,
                "active_months": active_months,
                "avg_monthly": total / max(1, active_months),
                "regularity": 1.0 / (1.0 + _std(month_values)),
                "performance_score": 0.0,
            }
        )

    if not rows:
        return {"model": "none", "segments": [], "recolteurs": [], "warnings": ["Aucun recolteur"]}

    totals_values = [row["total_regimes"] for row in rows]
    p50 = _percentile(totals_values, 0.50)
    p80 = _percentile(totals_values, 0.80)
    max_total = max(totals_values) or 1.0
    for row in rows:
        row["performance_score"] = round(
            100
            * (
                0.70 * (row["total_regimes"] / max_total)
                + 0.20 * min(1.0, row["active_months"] / 12)
                + 0.10 * row["regularity"]
            ),
            2,
        )

    features = ["total_regimes", "active_months", "avg_monthly", "regularity", "performance_score"]
    warnings = []
    if SKLEARN_AVAILABLE and len(rows) >= 3:
        k = min(3, len(rows))
        scaler = StandardScaler()
        x_scaled = scaler.fit_transform(_as_matrix(rows, features))
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = list(model.fit_predict(x_scaled))
        algorithm = "kmeans_performance_v1"
    else:
        algorithm = "quantile_segments_fallback"
        warnings.append("KMeans indisponible ou donnees insuffisantes: segmentation par quantiles")
        labels = []
        for row in rows:
            if row["total_regimes"] >= p80:
                labels.append(2)
            elif row["total_regimes"] >= p50:
                labels.append(1)
            else:
                labels.append(0)

    label_stats = defaultdict(list)
    for row, label in zip(rows, labels):
        label_stats[int(label)].append(row["performance_score"])

    label_order = sorted(label_stats, key=lambda label: _mean(label_stats[label]))
    label_to_name = {}
    names = ["a_developper", "regulier", "haute_performance"]
    for idx, label in enumerate(label_order):
        label_to_name[label] = names[min(idx, len(names) - 1)]

    for row, label in zip(rows, labels):
        row["cluster"] = int(label)
        row["segment"] = label_to_name[int(label)]
        if row["segment"] == "haute_performance":
            row["recommendation"] = "Capitaliser sur ce profil et partager ses pratiques"
        elif row["segment"] == "regulier":
            row["recommendation"] = "Maintenir le rythme et cibler les mois faibles"
        else:
            row["recommendation"] = "Prevoir accompagnement terrain et suivi rapproche"

    segments = []
    for segment in names:
        members = [row for row in rows if row["segment"] == segment]
        segments.append(
            {
                "segment": segment,
                "count": len(members),
                "avg_score": round(_mean([row["performance_score"] for row in members]), 2),
                "avg_total_regimes": round(_mean([row["total_regimes"] for row in members]), 2),
            }
        )

    return {
        "model": algorithm,
        "segments": segments,
        "recolteurs": sorted(rows, key=lambda row: row["performance_score"], reverse=True),
        "warnings": warnings,
    }


def build_recommendations(regression: dict[str, Any], anomalies: dict[str, Any], clustering: dict[str, Any]) -> list[dict[str, Any]]:
    recommendations = []
    top_anomalies = [item for item in anomalies.get("items", []) if item.get("classification") != "normal"][:5]
    for item in top_anomalies:
        secteur = item.get("secteur") or {}
        recommendations.append(
            {
                "priority": "haute" if item.get("niveau") == "eleve" else "moyenne",
                "scope": "secteur",
                "target": secteur.get("code") or secteur.get("nom") or "N/A",
                "message": item.get("recommendation"),
                "drivers": item.get("reasons", []),
            }
        )

    weak_recolteurs = [row for row in clustering.get("recolteurs", []) if row.get("segment") == "a_developper"][:5]
    if weak_recolteurs:
        recommendations.append(
            {
                "priority": "moyenne",
                "scope": "recolteurs",
                "target": "segment_a_developper",
                "message": "Organiser un suivi des recolteurs a faible performance",
                "drivers": [f"{row['nom']} ({row['performance_score']})" for row in weak_recolteurs],
            }
        )

    if regression.get("confidence", 0) < 0.45:
        recommendations.append(
            {
                "priority": "moyenne",
                "scope": "donnees",
                "target": "historique",
                "message": "Augmenter l'historique ou completer les fiches pour fiabiliser les predictions",
                "drivers": regression.get("warnings", []),
            }
        )

    return recommendations


def compute_advanced_ai(year: int, secteur_id: int | None = None, horizon_months: int = 6) -> dict[str, Any]:
    dataset = build_monthly_dataset(year=year, secteur_id=secteur_id)
    regression = train_rendement_regression(dataset, horizon_months=horizon_months, secteur_id=secteur_id)
    anomalies = detect_anomalies_isolation_forest(dataset, year=year)
    clustering = cluster_recolteurs(year=year)

    individual_count = FicheRecolteDetail.objects.filter(ligne__fiche__date__year=year).count()
    receipts_count = FicheRecuVente.objects.filter(date__year=year).count()
    fiches_count = FicheRecolte.objects.filter(date__year=year).count()
    facteurs_qs = FacteurProduction.objects.filter(year=year)
    if secteur_id:
        facteurs_qs = facteurs_qs.filter(secteur_id=secteur_id)
    facteurs_count = facteurs_qs.count()
    factor_coverage = round(facteurs_count / max(1, len(dataset.rows)), 4)

    return {
        "year": int(year),
        "scope": {
            "secteur": int(secteur_id) if secteur_id else None,
            "niveau": ["recolte_individuelle", "aggregation_temporelle"],
        },
        "pipeline": {
            "preprocessing": {
                "missing_values": "imputation_zero_et_valeurs_par_defaut",
                "feature_engineering": [
                    "saisonnalite_sin_cos",
                    "rolling_3_6_mois",
                    "tendance_courte",
                    "ratios_regimes",
                    "cout_par_regime",
                    "rendement_par_hectare",
                ],
                "rows_monthly": len(dataset.rows),
                "rows_individual": individual_count,
                "receipts": receipts_count,
                "fiches": fiches_count,
                "facteurs_production": facteurs_count,
                "coverage_facteurs": factor_coverage,
            },
            "training": {
                "regression": regression["model"],
                "anomaly_detection": anomalies["model"],
                "clustering": clustering["model"],
            },
            "evaluation": regression.get("metrics", {}),
        },
        "prediction": regression,
        "anomalies": anomalies,
        "performance": clustering,
        "recommendations": build_recommendations(regression, anomalies, clustering),
        "warnings": list(
            dict.fromkeys(
                (regression.get("warnings") or [])
                + (anomalies.get("warnings") or [])
                + (clustering.get("warnings") or [])
                + (["Couverture faible des facteurs de production pour l'annee demandee"] if factor_coverage < 0.5 else [])
            )
        ),
    }
