import csv

from django.http import HttpResponse
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import status

from secteurs.models import Secteur
from utils.csv_utils import clean_str, csv_template_response, parse_decimal, parse_int, read_uploaded_csv

from .models import Anomalie, FacteurProduction, ParametreIA, PredictionScenario
from .serializers import (
    AnomalieResolveSerializer,
    AnomalieSerializer,
    FacteurProductionSerializer,
    ParametreIASerializer,
    PredictionScenarioSerializer,
)
from .advanced import compute_advanced_ai
from .services import DEFAULT_CONFIG, compute_anomalies, compute_predictions, get_default_year


FACTEUR_IMPORT_FIELDS = [
    "secteur_code",
    "year",
    "month",
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
    "accessibilite_secteur",
    "distance_collecte_km",
    "incident_signale",
    "type_incident",
    "severite_incident",
    "observations",
]


def _parse_bool(value):
    raw = clean_str(value).lower()
    if raw in {"1", "true", "vrai", "oui", "yes", "y"}:
        return True
    if raw in {"0", "false", "faux", "non", "no", "n", ""}:
        return False
    return None


class FacteurProductionViewSet(viewsets.ModelViewSet):
    serializer_class = FacteurProductionSerializer
    queryset = FacteurProduction.objects.select_related("secteur").all()

    def get_queryset(self):
        qs = super().get_queryset()
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")
        secteur = self.request.query_params.get("secteur")
        if year:
            qs = qs.filter(year=int(year))
        if month:
            qs = qs.filter(month=int(month))
        if secteur:
            qs = qs.filter(secteur_id=int(secteur))
        return qs

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        return csv_template_response(
            "facteurs_production_template.csv",
            fieldnames=FACTEUR_IMPORT_FIELDS,
            example_rows=[
                {
                    "secteur_code": "GP_1",
                    "year": "2026",
                    "month": "1",
                    "pluviometrie_mm": "120",
                    "temperature_moyenne": "27.5",
                    "humidite_air_pct": "78",
                    "jours_secheresse": "3",
                    "jours_pluie": "12",
                    "vents_forts": "non",
                    "humidite_sol_pct": "62",
                    "ph_sol": "6.2",
                    "fertilite_sol_indice": "75",
                    "drainage_sol_indice": "68",
                    "age_palmiers_annees": "8",
                    "jours_depuis_derniere_recolte": "18",
                    "frequence_recolte_jours": "21",
                    "desherbage_effectue": "oui",
                    "fertilisation_effectuee": "oui",
                    "traitement_phytosanitaire": "non",
                    "elagage_effectue": "non",
                    "engrais_kg": "45",
                    "pesticide_l": "0",
                    "herbicide_l": "2",
                    "cout_intrants_fcfa": "35000",
                    "maladie_detectee": "non",
                    "niveau_infestation": "0",
                    "main_oeuvre_disponible": "8",
                    "absenteisme_pct": "5",
                    "accessibilite_secteur": "bonne",
                    "distance_collecte_km": "2.5",
                    "incident_signale": "non",
                    "type_incident": "",
                    "severite_incident": "0",
                    "observations": "RAS",
                }
            ],
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=facteurs_production_export.csv"
        writer = csv.writer(response)
        writer.writerow(FACTEUR_IMPORT_FIELDS)
        for obj in self.get_queryset().order_by("secteur__code", "year", "month"):
            writer.writerow([obj.secteur.code if field == "secteur_code" else getattr(obj, field, "") for field in FACTEUR_IMPORT_FIELDS])
        return response

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_csv(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "Fichier requis (champ 'file')"}, status=status.HTTP_400_BAD_REQUEST)

        rows = read_uploaded_csv(f)
        created = 0
        updated = 0
        errors = []

        decimal_fields = {
            "pluviometrie_mm",
            "temperature_moyenne",
            "humidite_air_pct",
            "humidite_sol_pct",
            "ph_sol",
            "fertilite_sol_indice",
            "drainage_sol_indice",
            "age_palmiers_annees",
            "engrais_kg",
            "pesticide_l",
            "herbicide_l",
            "niveau_infestation",
            "absenteisme_pct",
            "distance_collecte_km",
            "severite_incident",
        }
        int_fields = {
            "year",
            "month",
            "jours_secheresse",
            "jours_pluie",
            "jours_depuis_derniere_recolte",
            "frequence_recolte_jours",
            "cout_intrants_fcfa",
            "main_oeuvre_disponible",
        }
        bool_fields = {
            "vents_forts",
            "desherbage_effectue",
            "fertilisation_effectuee",
            "traitement_phytosanitaire",
            "elagage_effectue",
            "maladie_detectee",
            "incident_signale",
        }

        for idx, row in enumerate(rows, start=2):
            secteur_code = clean_str(row.get("secteur_code"))
            secteur = Secteur.objects.filter(code=secteur_code).first() if secteur_code else None
            if not secteur:
                errors.append({"line": idx, "error": f"Secteur introuvable: {secteur_code or 'vide'}"})
                continue

            payload = {"secteur": secteur.id}
            row_errors = []
            for field in FACTEUR_IMPORT_FIELDS:
                if field == "secteur_code":
                    continue
                if field in decimal_fields:
                    payload[field] = parse_decimal(row.get(field))
                elif field in int_fields:
                    payload[field] = parse_int(row.get(field), default=None)
                elif field in bool_fields:
                    parsed = _parse_bool(row.get(field))
                    if parsed is None:
                        row_errors.append(f"Booleen invalide pour {field}")
                    payload[field] = bool(parsed)
                else:
                    payload[field] = clean_str(row.get(field))

            if row_errors:
                errors.append({"line": idx, "error": row_errors})
                continue

            serializer = FacteurProductionSerializer(data=payload)
            if not serializer.is_valid():
                errors.append({"line": idx, "error": serializer.errors})
                continue

            obj, was_created = FacteurProduction.objects.update_or_create(
                secteur=secteur,
                year=serializer.validated_data["year"],
                month=serializer.validated_data["month"],
                defaults={k: v for k, v in serializer.validated_data.items() if k not in {"secteur", "year", "month"}},
            )
            if was_created:
                created += 1
            else:
                updated += 1

        if errors:
            return Response({"ok": False, "created": created, "updated": updated, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"ok": True, "created": created, "updated": updated, "errors": []})


class ParametreIAViewSet(viewsets.ModelViewSet):
    queryset = ParametreIA.objects.all().order_by("key")
    serializer_class = ParametreIASerializer


class PredictionScenarioViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = PredictionScenario.objects.select_related("secteur").all().order_by("-created_at")
    serializer_class = PredictionScenarioSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        year = self.request.query_params.get("year")
        secteur = self.request.query_params.get("secteur")
        if year:
            qs = qs.filter(year=int(year))
        if secteur:
            qs = qs.filter(secteur_id=int(secteur))
        return qs

    @action(detail=False, methods=["post"], url_path="recompute")
    def recompute(self, request):
        year = request.query_params.get("year")
        secteur = request.query_params.get("secteur")
        horizon = request.query_params.get("horizon")
        year = int(year) if year else get_default_year()
        horizon = int(horizon) if horizon else int(DEFAULT_CONFIG["prediction_horizon_months"])

        pred = compute_predictions(year=year, secteur_id=int(secteur) if secteur else None, config={"prediction_horizon_months": horizon})

        scenario = PredictionScenario.objects.create(
            year=year,
            horizon_months=horizon,
            secteur_id=int(secteur) if secteur else None,
            algorithm=pred.get("model") or "seasonal_linear_v1",
            metrics=pred.get("metrics") or {},
            predictions=pred.get("predictions") or [],
        )

        return Response(PredictionScenarioSerializer(scenario).data)


class AnomalieViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Anomalie.objects.select_related("secteur", "recolteur", "fiche").all().order_by("-created_at")
    serializer_class = AnomalieSerializer

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return AnomalieResolveSerializer
        return AnomalieSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        year = self.request.query_params.get("year")
        resolved = self.request.query_params.get("resolved")
        type_ = self.request.query_params.get("type")
        niveau = self.request.query_params.get("niveau")

        if year:
            qs = qs.filter(year=int(year))
        if resolved in {"0", "1"}:
            qs = qs.filter(resolved=(resolved == "1"))
        if type_:
            qs = qs.filter(type=type_)
        if niveau:
            qs = qs.filter(niveau=niveau)
        return qs

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resolved = bool(serializer.validated_data.get("resolved"))

        obj.resolved = resolved
        obj.resolved_at = timezone.now() if resolved else None
        obj.save(update_fields=["resolved", "resolved_at"])
        return Response(AnomalieSerializer(obj).data)

    @action(detail=False, methods=["post"], url_path="recompute")
    def recompute(self, request):
        year = request.query_params.get("year")
        year = int(year) if year else get_default_year()

        # On efface les anomalies non resolues de l'annee et on recalcule
        with transaction.atomic():
            Anomalie.objects.filter(year=year, resolved=False).delete()
            rows = compute_anomalies(year)
            created = 0
            for row in rows:
                Anomalie.objects.create(
                    year=year,
                    month=row.get("month"),
                    date=row.get("date"),
                    type=row.get("type") or "unknown",
                    niveau=row.get("niveau") or Anomalie.NIVEAU_MOYEN,
                    metric=row.get("metric") or "",
                    value=row.get("value"),
                    expected_min=row.get("expected_min"),
                    expected_max=row.get("expected_max"),
                    message=row.get("message") or "",
                    details=row,
                    secteur_id=row.get("secteur_id"),
                    recolteur_id=row.get("recolteur_id"),
                    fiche_id=row.get("fiche_id"),
                )
                created += 1

        return Response({"ok": True, "year": year, "created": created})


@api_view(["GET"])
def ia_summary_view(request):
    year = request.query_params.get("year")
    year = int(year) if year else get_default_year()
    secteur = request.query_params.get("secteur")
    horizon = request.query_params.get("horizon")
    horizon = int(horizon) if horizon else int(DEFAULT_CONFIG["prediction_horizon_months"])

    predictions = compute_predictions(year=year, secteur_id=int(secteur) if secteur else None)
    anomalies = compute_anomalies(year=year)
    advanced = compute_advanced_ai(
        year=year,
        secteur_id=int(secteur) if secteur else None,
        horizon_months=horizon,
    )

    return Response(
        {
            "year": year,
            "config": DEFAULT_CONFIG,
            "predictions": predictions,
            "anomalies": anomalies,
            "advanced": advanced,
        }
    )


@api_view(["GET"])
def ia_advanced_view(request):
    year = request.query_params.get("year")
    year = int(year) if year else get_default_year()
    secteur = request.query_params.get("secteur")
    horizon = request.query_params.get("horizon")
    horizon = int(horizon) if horizon else int(DEFAULT_CONFIG["prediction_horizon_months"])

    return Response(
        compute_advanced_ai(
            year=year,
            secteur_id=int(secteur) if secteur else None,
            horizon_months=horizon,
        )
    )
