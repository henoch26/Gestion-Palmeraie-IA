from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
from recolteurs.models import Recolteur
from secteurs.models import Secteur


DEFAULT_CONFIG = {
    "training_window_months": 36,
    "prediction_horizon_months": 6,
    "outlier_iqr_k": 1.5,
    "non_conformes_threshold_pct": 5.0,
    "min_points_to_train": 8,
}


@dataclass
class MonthlyPoint:
    year: int
    month: int
    total: int

    @property
    def t(self) -> int:
        return self.year * 12 + (self.month - 1)


def _month_pairs_from(start: date, horizon_months: int) -> list[tuple[int, int]]:
    res = []
    y, m = start.year, start.month
    for _ in range(horizon_months):
        res.append((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1
    return res


def _ols_fit_4(x_rows: list[list[float]], y: list[float]) -> list[float] | None:
    """
    OLS beta = (X'X)^-1 X'y
    Ici dimension fixee 4 pour eviter d'ajouter numpy.
    """
    n = len(x_rows)
    if n == 0:
        return None

    # XtX (4x4) et Xty (4)
    xtx = [[0.0] * 4 for _ in range(4)]
    xty = [0.0] * 4
    for xi, yi in zip(x_rows, y):
        for i in range(4):
            xty[i] += xi[i] * yi
            for j in range(4):
                xtx[i][j] += xi[i] * xi[j]

    # Resolution par elimination de Gauss (4x4)
    # Augmente la matrice: [XtX | Xty]
    a = [row[:] + [b] for row, b in zip(xtx, xty)]

    for col in range(4):
        # pivot
        pivot = None
        pivot_val = 0.0
        for r in range(col, 4):
            v = abs(a[r][col])
            if v > pivot_val:
                pivot_val = v
                pivot = r
        if pivot is None or pivot_val < 1e-12:
            return None
        if pivot != col:
            a[col], a[pivot] = a[pivot], a[col]

        # normalise pivot row
        pv = a[col][col]
        for c in range(col, 5):
            a[col][c] /= pv

        # eliminate others
        for r in range(4):
            if r == col:
                continue
            factor = a[r][col]
            if abs(factor) < 1e-12:
                continue
            for c in range(col, 5):
                a[r][c] -= factor * a[col][c]

    return [a[i][4] for i in range(4)]


def _mae_rmse(y_true: list[float], y_pred: list[float]) -> dict[str, float]:
    n = max(1, len(y_true))
    mae = sum(abs(a - b) for a, b in zip(y_true, y_pred)) / n
    rmse = math.sqrt(sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / n)
    return {"mae": round(mae, 3), "rmse": round(rmse, 3), "n": int(len(y_true))}


def _time_split(points: list[MonthlyPoint], valid_ratio: float = 0.2, min_valid: int = 3):
    points = sorted(points, key=lambda p: (p.year, p.month))
    n = len(points)
    if n < (min_valid + 4):
        return points, []
    valid_n = max(min_valid, int(round(n * valid_ratio)))
    valid_n = min(valid_n, n - 4)
    return points[:-valid_n], points[-valid_n:]


def fit_predict_seasonal_linear(points: list[MonthlyPoint], horizon_months: int) -> dict:
    """
    Modele: y = b0 + b1*t + b2*sin(2pi*m/12) + b3*cos(2pi*m/12)
    """
    if not points:
        return {"model": "seasonal_linear_v1", "beta": None, "pred": [], "metrics": {}}

    points = sorted(points, key=lambda p: (p.year, p.month))
    train, valid = _time_split(points)

    def build_x(ps: list[MonthlyPoint]):
        x = []
        y = []
        for p in ps:
            ang = 2 * math.pi * (p.month / 12.0)
            x.append([1.0, float(p.t), math.sin(ang), math.cos(ang)])
            y.append(float(p.total))
        return x, y

    x_train, y_train = build_x(train)
    x_valid, y_valid = build_x(valid)

    beta = _ols_fit_4(x_train, y_train)
    if beta is None:
        # fallback moyenne
        mean_val = sum(y_train) / max(1, len(y_train))
        beta = [mean_val, 0.0, 0.0, 0.0]

    def predict_point(p: MonthlyPoint) -> float:
        ang = 2 * math.pi * (p.month / 12.0)
        yhat = beta[0] + beta[1] * float(p.t) + beta[2] * math.sin(ang) + beta[3] * math.cos(ang)
        return max(0.0, float(yhat))

    pred_train = [predict_point(p) for p in train]
    pred_valid = [predict_point(p) for p in valid]

    metrics = {
        "train": _mae_rmse(y_train, pred_train),
        "valid": _mae_rmse(y_valid, pred_valid) if valid else {},
    }

    last = points[-1]
    # start: mois suivant
    start = date(last.year, last.month, 1)
    # move to next month
    if start.month == 12:
        start = date(start.year + 1, 1, 1)
    else:
        start = date(start.year, start.month + 1, 1)

    future_pairs = _month_pairs_from(start, horizon_months)
    future = []
    for yy, mm in future_pairs:
        t = yy * 12 + (mm - 1)
        ang = 2 * math.pi * (mm / 12.0)
        yhat = beta[0] + beta[1] * float(t) + beta[2] * math.sin(ang) + beta[3] * math.cos(ang)
        future.append({"year": yy, "month": mm, "yhat_total": int(max(0.0, round(yhat)))})

    return {
        "model": "seasonal_linear_v1",
        "beta": beta,
        "pred": future,
        "metrics": metrics,
    }


def fit_predict_seasonal_mean(points: list[MonthlyPoint], horizon_months: int) -> dict:
    """
    Modele simple: moyenne par mois (saisonnier naive).
    """
    if not points:
        return {"model": "seasonal_mean_v1", "pred": [], "metrics": {}}

    points = sorted(points, key=lambda p: (p.year, p.month))
    train, valid = _time_split(points)

    month_values = {m: [] for m in range(1, 13)}
    y_train = []
    for p in train:
        month_values[p.month].append(float(p.total))
        y_train.append(float(p.total))

    month_mean = {}
    for m in range(1, 13):
        vals = month_values[m]
        month_mean[m] = (sum(vals) / len(vals)) if vals else (sum(y_train) / max(1, len(y_train)))

    def predict_month(m: int) -> float:
        return max(0.0, float(month_mean.get(int(m), 0.0)))

    pred_train = [predict_month(p.month) for p in train]
    pred_valid = [predict_month(p.month) for p in valid]
    y_valid = [float(p.total) for p in valid]

    metrics = {
        "train": _mae_rmse(y_train, pred_train),
        "valid": _mae_rmse(y_valid, pred_valid) if valid else {},
    }

    last = points[-1]
    start = date(last.year, last.month, 1)
    if start.month == 12:
        start = date(start.year + 1, 1, 1)
    else:
        start = date(start.year, start.month + 1, 1)

    future_pairs = _month_pairs_from(start, horizon_months)
    future = []
    for yy, mm in future_pairs:
        future.append({"year": yy, "month": mm, "yhat_total": int(round(predict_month(mm)))})

    return {"model": "seasonal_mean_v1", "pred": future, "metrics": metrics, "month_mean": month_mean}


def select_best_forecast(points: list[MonthlyPoint], horizon_months: int, min_points: int) -> dict:
    if len(points) < min_points:
        return fit_predict_seasonal_mean(points, horizon_months)

    candidates = [
        fit_predict_seasonal_linear(points, horizon_months),
        fit_predict_seasonal_mean(points, horizon_months),
    ]

    def valid_mae(fit: dict) -> float:
        return float((fit.get("metrics") or {}).get("valid", {}).get("mae") or 1e18)

    best = min(candidates, key=valid_mae)
    return best


def _iqr_bounds(values: list[float], k: float) -> tuple[float, float] | None:
    if len(values) < 4:
        return None
    xs = sorted(values)

    def quantile(q):
        pos = (len(xs) - 1) * q
        lo = int(math.floor(pos))
        hi = int(math.ceil(pos))
        if lo == hi:
            return xs[lo]
        w = pos - lo
        return xs[lo] * (1 - w) + xs[hi] * w

    q1 = quantile(0.25)
    q3 = quantile(0.75)
    iqr = q3 - q1
    return (q1 - k * iqr, q3 + k * iqr)


def get_sector_monthly_totals(secteur: Secteur, training_window_months: int | None = None) -> list[MonthlyPoint]:
    qs = (
        FicheRecolteDetail.objects.filter(secteur=secteur)
        .values("ligne__fiche__date__year", "ligne__fiche__date__month")
        .annotate(total=Sum("quantite"))
        .order_by("ligne__fiche__date__year", "ligne__fiche__date__month")
    )
    points = [
        MonthlyPoint(
            year=int(r["ligne__fiche__date__year"]),
            month=int(r["ligne__fiche__date__month"]),
            total=int(r["total"] or 0),
        )
        for r in qs
    ]
    if training_window_months and len(points) > training_window_months:
        return points[-training_window_months:]
    return points


def get_global_monthly_totals(training_window_months: int | None = None) -> list[MonthlyPoint]:
    qs = (
        FicheRecolteDetail.objects.all()
        .values("ligne__fiche__date__year", "ligne__fiche__date__month")
        .annotate(total=Sum("quantite"))
        .order_by("ligne__fiche__date__year", "ligne__fiche__date__month")
    )
    points = [
        MonthlyPoint(
            year=int(r["ligne__fiche__date__year"]),
            month=int(r["ligne__fiche__date__month"]),
            total=int(r["total"] or 0),
        )
        for r in qs
    ]
    if training_window_months and len(points) > training_window_months:
        return points[-training_window_months:]
    return points


def _filter_points_upto_year(points: list[MonthlyPoint], max_year: int) -> list[MonthlyPoint]:
    return [p for p in points if int(p.year) <= int(max_year)]


def compute_predictions(year: int, secteur_id: int | None = None, config: dict | None = None) -> dict:
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    horizon = int(cfg["prediction_horizon_months"])
    window = int(cfg["training_window_months"])
    min_points = int(cfg["min_points_to_train"])

    if secteur_id:
        secteur = Secteur.objects.filter(id=int(secteur_id)).first()
        if not secteur:
            return {"year": year, "secteur": None, "predictions": [], "metrics": {}, "model": None}
        points = _filter_points_upto_year(get_sector_monthly_totals(secteur), year)
        if window and len(points) > window:
            points = points[-window:]
        fit = select_best_forecast(points, horizon, min_points)

        superficie = float(secteur.superficie_ha or 0)
        preds = []
        for row in fit["pred"]:
            yhat = int(row["yhat_total"])
            preds.append(
                {
                    "year": row["year"],
                    "month": row["month"],
                    "yhat_total_regimes": yhat,
                    "yhat_rendement_ha": round(float(yhat) / superficie, 4) if superficie else 0,
                }
            )

        return {
            "year": year,
            "secteur": {"id": secteur.id, "code": secteur.code, "nom": secteur.nom, "superficie_ha": float(secteur.superficie_ha or 0)},
            "model": fit["model"],
            "metrics": fit["metrics"],
            "predictions": preds,
        }

    points = _filter_points_upto_year(get_global_monthly_totals(), year)
    if window and len(points) > window:
        points = points[-window:]
    fit = select_best_forecast(points, horizon, min_points)
    preds = [
        {
            "year": row["year"],
            "month": row["month"],
            "yhat_total_regimes": int(row["yhat_total"]),
        }
        for row in fit["pred"]
    ]
    return {"year": year, "secteur": None, "model": fit["model"], "metrics": fit["metrics"], "predictions": preds}


def compute_anomalies(year: int, config: dict | None = None) -> list[dict]:
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    k = float(cfg["outlier_iqr_k"])
    non_conf_th = float(cfg["non_conformes_threshold_pct"])
    min_points = int(cfg["min_points_to_train"])

    anomalies = []

    # 1) Non conformes (recus)
    recus = FicheRecuVente.objects.filter(date__isnull=False, date__year=year).select_related("fiche")
    pct_values = []
    for r in recus:
        try:
            pct = float(r.non_conformes_pct or 0)
        except Exception:
            pct = 0.0
        pct_values.append(pct)
        if pct >= non_conf_th:
            niveau = "eleve" if pct >= (non_conf_th * 2) else "moyen"
            anomalies.append(
                {
                    "type": "non_conformes_pct_high",
                    "niveau": niveau,
                    "metric": "non_conformes_pct",
                    "value": Decimal(str(round(pct, 2))),
                    "expected_max": Decimal(str(non_conf_th)),
                    "message": f"Taux de non conformes eleve: {pct}%",
                    "date": r.date,
                    "fiche_id": r.fiche_id,
                }
            )

    # Non conformes outlier (IQR)
    bounds_pct = _iqr_bounds([float(v) for v in pct_values], k) if pct_values else None
    if bounds_pct:
        _low, high = bounds_pct
        for r in recus:
            pct = float(r.non_conformes_pct or 0)
            if pct > high:
                anomalies.append(
                    {
                        "type": "non_conformes_pct_outlier",
                        "niveau": "moyen",
                        "metric": "non_conformes_pct",
                        "value": Decimal(str(round(pct, 2))),
                        "expected_max": Decimal(str(round(high, 2))),
                        "message": f"Taux de non conformes atypique: {pct}%",
                        "date": r.date,
                        "fiche_id": r.fiche_id,
                    }
                )

    # 1b) Depenses recolte (outlier sur les fiches)
    dep_values = []
    fiches = FicheRecolte.objects.filter(date__year=year).only("id", "date", "depense_nourriture", "depense_transport")
    for f in fiches:
        dep = float((f.depense_nourriture or 0) + (f.depense_transport or 0))
        dep_values.append(dep)
    dep_bounds = _iqr_bounds(dep_values, k) if dep_values else None
    if dep_bounds:
        _low, high = dep_bounds
        for f in fiches:
            dep = float((f.depense_nourriture or 0) + (f.depense_transport or 0))
            if dep > high and dep > 0:
                anomalies.append(
                    {
                        "type": "depenses_recolte_outlier",
                        "niveau": "moyen",
                        "metric": "depenses_total_recolte",
                        "value": Decimal(str(round(dep, 2))),
                        "expected_max": Decimal(str(round(high, 2))),
                        "message": f"Depenses recolte atypiques sur la fiche {f.id}: {dep} FCFA",
                        "date": f.date,
                        "fiche_id": f.id,
                    }
                )

    # 1c) Montant ventes (outlier sur recus)
    montant_values = [float(r.montant or 0) for r in recus]
    bounds_m = _iqr_bounds(montant_values, k) if montant_values else None
    if bounds_m:
        _low, high = bounds_m
        for r in recus:
            m = float(r.montant or 0)
            if m > high and m > 0:
                anomalies.append(
                    {
                        "type": "montant_vente_outlier",
                        "niveau": "moyen",
                        "metric": "montant",
                        "value": Decimal(str(round(m, 2))),
                        "expected_max": Decimal(str(round(high, 2))),
                        "message": f"Montant de vente atypique: {m} FCFA",
                        "date": r.date,
                        "fiche_id": r.fiche_id,
                    }
                )

    # 2) Outliers secteur (mensuel)
    for secteur in Secteur.objects.all():
        qs = (
            FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche__date__year=year)
            .values("ligne__fiche__date__month")
            .annotate(total=Sum("quantite"))
        )
        month_map = {int(r["ligne__fiche__date__month"]): int(r["total"] or 0) for r in qs}
        values = [float(v) for v in month_map.values() if v is not None]
        bounds = _iqr_bounds(values, k)
        if not bounds:
            continue
        low, high = bounds
        for mm, total in month_map.items():
            if float(total) < low or float(total) > high:
                superficie = float(secteur.superficie_ha or 0)
                rendement = float(total) / superficie if superficie else 0.0
                anomalies.append(
                    {
                        "type": "production_secteur_outlier",
                        "niveau": "moyen" if float(total) > high else "faible",
                        "metric": "total_regimes",
                        "value": Decimal(str(total)),
                        "expected_min": Decimal(str(round(low, 2))),
                        "expected_max": Decimal(str(round(high, 2))),
                        "message": f"Valeur atypique sur {secteur.code} (mois {mm}): {total} regimes (rendement {rendement:.2f} reg/ha)",
                        "month": mm,
                        "secteur_id": secteur.id,
                    }
                )

    # 3) Outliers recolteur (mensuel)
    for recolteur in Recolteur.objects.all():
        qs = (
            FicheRecolteDetail.objects.filter(ligne__recolteur=recolteur, ligne__fiche__date__year=year)
            .values("ligne__fiche__date__month")
            .annotate(total=Sum("quantite"))
        )
        month_map = {int(r["ligne__fiche__date__month"]): int(r["total"] or 0) for r in qs}
        values = [float(v) for v in month_map.values() if v is not None]
        bounds = _iqr_bounds(values, k)
        if not bounds:
            continue
        low, high = bounds
        for mm, total in month_map.items():
            if float(total) < low or float(total) > high:
                anomalies.append(
                    {
                        "type": "production_recolteur_outlier",
                        "niveau": "moyen" if float(total) > high else "faible",
                        "metric": "total_regimes",
                        "value": Decimal(str(total)),
                        "expected_min": Decimal(str(round(low, 2))),
                        "expected_max": Decimal(str(round(high, 2))),
                        "message": f"Valeur atypique pour {recolteur.nom} (mois {mm}): {total} regimes",
                        "month": mm,
                        "recolteur_id": recolteur.id,
                    }
                )

    # 4) Ecart important vs prediction (secteurs) - base sur l'historique avant l'annee
    for secteur in Secteur.objects.all():
        train_points = _filter_points_upto_year(get_sector_monthly_totals(secteur), year - 1)
        if len(train_points) < min_points:
            continue
        fit = select_best_forecast(train_points, horizon_months=12, min_points=min_points)
        rmse_ref = float((fit.get("metrics") or {}).get("valid", {}).get("rmse") or (fit.get("metrics") or {}).get("train", {}).get("rmse") or 0.0)
        if rmse_ref <= 0:
            rmse_ref = 1.0

        pred_map = {(int(r["year"]), int(r["month"])): float(r["yhat_total"]) for r in (fit.get("pred") or [])}
        actual_qs = (
            FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche__date__year=year)
            .values("ligne__fiche__date__month")
            .annotate(total=Sum("quantite"))
        )
        for row in actual_qs:
            mm = int(row["ligne__fiche__date__month"])
            actual = float(row["total"] or 0)
            yhat = pred_map.get((year, mm))
            if yhat is None:
                continue
            if abs(actual - yhat) > (2.5 * rmse_ref) and actual > 0:
                anomalies.append(
                    {
                        "type": "production_secteur_vs_prediction",
                        "niveau": "moyen",
                        "metric": "total_regimes",
                        "value": Decimal(str(round(actual, 2))),
                        "expected_min": Decimal(str(round(max(0.0, yhat - 2.5 * rmse_ref), 2))),
                        "expected_max": Decimal(str(round(yhat + 2.5 * rmse_ref, 2))),
                        "message": f"Ecart important vs prediction sur {secteur.code} (mois {mm}): {actual} vs {round(yhat, 0)}",
                        "month": mm,
                        "secteur_id": secteur.id,
                    }
                )

    return anomalies


def get_default_year() -> int:
    return int(timezone.now().date().year)
