from calendar import monthrange
from datetime import date

from django.db.models import Avg, Sum


def _as_float(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _round(value, digits=2):
    return round(_as_float(value), digits)


def _months_between(start_date, end_date):
    if not start_date or not end_date:
        return None
    months = (end_date.year - start_date.year) * 12 + end_date.month - start_date.month
    if end_date.day < start_date.day:
        months -= 1
    return max(months, 0)


def _month_add(year, month, offset):
    index = year * 12 + (month - 1) + offset
    return index // 12, index % 12 + 1


def _month_bounds(year, month):
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _previous_months(year, month, count):
    months = []
    for offset in range(count, 0, -1):
        months.append(_month_add(year, month, -offset))
    return months


class VariablesAgronomiquesService:
    """Calcule les variables robustes utilisees par le modele de rendement.

    Les variables restent volontairement simples : age reel estime des plants et
    climat recent avant la recolte. Elles completent le contexte agronomique
    sans introduire de decalages biologiques difficiles a justifier.
    """

    def features_pour_secteur(self, secteur, annee, mois):
        annee = int(annee)
        mois = int(mois)
        reference = date(annee, mois, monthrange(annee, mois)[1])
        return {
            **self._features_age(secteur, reference),
            **self._features_meteo_recente(secteur.id, annee, mois),
        }

    def features_pour_secteur_id(self, secteur_id, annee, mois, age_moyen_plants=None):
        from secteurs.models import Secteur

        secteur = None
        if secteur_id:
            secteur = Secteur.objects.filter(pk=secteur_id).first()
        if secteur:
            return self.features_pour_secteur(secteur, annee, mois)

        fallback_age_mois = _as_float(age_moyen_plants, 10) * 12
        return {
            "age_reel_plantation_mois": _round(fallback_age_mois),
            "age_reel_plants_mois": _round(fallback_age_mois),
            **self._features_meteo_recente(secteur_id, int(annee), int(mois)),
        }

    def _features_age(self, secteur, reference):
        from plantations.models import OperationPlantation

        fallback_age_mois = _as_float(getattr(secteur, "age_moyen_plants", None), 10) * 12
        operation = (
            OperationPlantation.objects
            .filter(secteur=secteur, date_plantation__lte=reference)
            .order_by("-date_plantation", "-id")
            .first()
        )
        if not operation:
            return {
                "age_reel_plantation_mois": _round(fallback_age_mois),
                "age_reel_plants_mois": _round(fallback_age_mois),
            }

        age_plantation = _months_between(operation.date_plantation, reference)
        age_plantation = fallback_age_mois if age_plantation is None else age_plantation
        if operation.age_plants_mois is not None:
            age_plants = age_plantation + operation.age_plants_mois
        else:
            age_plants = max(age_plantation, fallback_age_mois)

        return {
            "age_reel_plantation_mois": _round(age_plantation),
            "age_reel_plants_mois": _round(age_plants),
        }

    def _features_meteo_recente(self, secteur_id, annee, mois):
        meteo_3 = self._meteo_fenetre(secteur_id, annee, mois, 3)
        meteo_6 = self._meteo_fenetre(secteur_id, annee, mois, 6)
        return {
            "pluie_cumulee_3_mois": _round(meteo_3["precipitation_total"], 2),
            "pluie_cumulee_6_mois": _round(meteo_6["precipitation_total"], 2),
            "humidite_moyenne_3_mois": _round(meteo_3["humidite_moyenne"], 2),
            "temperature_moyenne_3_mois": _round(meteo_3["temperature_moyenne"], 2),
        }

    def _meteo_fenetre(self, secteur_id, annee, mois, count):
        from ia_module.models import DonneeMeteo

        months = _previous_months(annee, mois, count)
        start, _ = _month_bounds(*months[0])
        _, end = _month_bounds(*months[-1])

        qs = DonneeMeteo.objects.filter(date__gte=start, date__lte=end)
        if secteur_id:
            qs = qs.filter(secteur_id=secteur_id)

        exact = qs.aggregate(
            precipitation_total=Sum("precipitation_mm"),
            humidite_moyenne=Avg("humidite_pct"),
            temperature_moyenne=Avg("temperature_moy"),
        )
        if exact["precipitation_total"] is not None:
            return {
                "precipitation_total": _as_float(exact["precipitation_total"]),
                "humidite_moyenne": _as_float(exact["humidite_moyenne"], 75),
                "temperature_moyenne": _as_float(exact["temperature_moyenne"], 27),
            }

        month_numbers = [m for _, m in months]
        seasonal = DonneeMeteo.objects.filter(date__month__in=month_numbers)
        if secteur_id:
            seasonal = seasonal.filter(secteur_id=secteur_id)
        seasonal_agg = seasonal.aggregate(
            precipitation_moy=Avg("precipitation_mm"),
            humidite_moyenne=Avg("humidite_pct"),
            temperature_moyenne=Avg("temperature_moy"),
        )
        precip_moy = _as_float(seasonal_agg["precipitation_moy"], 100)
        return {
            "precipitation_total": precip_moy * count,
            "humidite_moyenne": _as_float(seasonal_agg["humidite_moyenne"], 75),
            "temperature_moyenne": _as_float(seasonal_agg["temperature_moyenne"], 27),
        }