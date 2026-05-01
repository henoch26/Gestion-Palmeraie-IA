import csv
import io

from django.http import HttpResponse
from django.db.models import Sum, Max
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser

from .models import Secteur
from .serializers import SecteurSerializer
from recoltes.models import FicheRecolte, FicheRecolteDetail
from recolteurs.models import Recolteur
from utils.csv_utils import csv_template_response, parse_decimal, clean_str, read_uploaded_csv


class SecteurViewSet(viewsets.ModelViewSet):
    # CRUD complet pour les secteurs
    serializer_class = SecteurSerializer

    def get_queryset(self):
        # Ajout d'indicateurs utiles pour les analyses (sans casser le CRUD)
        return (
            Secteur.objects.all()
            .annotate(
                production_total=Coalesce(Sum("details_recolte__quantite"), 0),
                last_recolte=Max("details_recolte__ligne__fiche__date"),
            )
            .order_by("-id")
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # Export CSV (liste secteurs + indicateurs)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=secteurs_export.csv"

        writer = csv.writer(response)
        writer.writerow(
            ["code", "nom", "superficie_ha", "production_total", "rendement_ha", "last_recolte"]
        )

        for s in self.get_queryset().order_by("code"):
            writer.writerow(
                [
                    s.code,
                    s.nom,
                    s.superficie_ha,
                    getattr(s, "production_total", 0) or 0,
                    SecteurSerializer(s).data.get("rendement_ha", 0),
                    getattr(s, "last_recolte", None) or "",
                ]
            )

        return response

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        # Modele CSV d'import
        return csv_template_response(
            "secteurs_template.csv",
            fieldnames=["code", "nom", "superficie_ha", "situation_relief", "type_sol"],
            example_rows=[
                {
                    "code": "GP_1",
                    "nom": "GP 1",
                    "superficie_ha": "7.47",
                    "situation_relief": "Plateau",
                    "type_sol": "Sableux / Argileux",
                }
            ],
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_csv(self, request):
        # Import CSV (creation ou mise a jour)
        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "Fichier requis (champ 'file')"}, status=status.HTTP_400_BAD_REQUEST)

        rows = read_uploaded_csv(f)
        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(rows, start=2):  # header=1
            code = clean_str(row.get("code"))
            nom = clean_str(row.get("nom"))
            superficie = parse_decimal(row.get("superficie_ha"))
            situation_relief = clean_str(row.get("situation_relief"))
            type_sol = clean_str(row.get("type_sol"))

            if not nom:
                errors.append({"line": idx, "error": "nom requis"})
                continue
            if superficie is None:
                errors.append({"line": idx, "error": "superficie_ha requise (nombre)"})
                continue

            secteur = None
            if code:
                secteur = Secteur.objects.filter(code=code).first()
            if not secteur:
                secteur = Secteur.objects.filter(nom__iexact=nom).first()

            if secteur:
                # MAJ
                secteur.nom = nom
                secteur.superficie_ha = superficie
                secteur.situation_relief = situation_relief
                secteur.type_sol = type_sol
                secteur.save()
                updated += 1
            else:
                Secteur.objects.create(
                    code=code or "",
                    nom=nom,
                    superficie_ha=superficie,
                    situation_relief=situation_relief,
                    type_sol=type_sol,
                )
                created += 1

        return Response({"ok": True, "created": created, "updated": updated, "errors": errors})

    @action(detail=True, methods=["get"], url_path="analytics")
    def analytics(self, request, pk=None):
        # Analytics d'un secteur (historique + comparaisons)
        secteur = self.get_object()
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        month_labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(
                    secteur=secteur,
                    ligne__fiche__date__year=target_year,
                )
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            by_month = {row["ligne__fiche__date__month"]: int(row["total"] or 0) for row in qs}
            data = [by_month.get(m, 0) for m in range(1, 13)]
            return {"labels": month_labels, "data": data}

        # Totaux par annee (5 ans glissants)
        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(
                secteur=secteur,
                ligne__fiche__date__year__gte=start_year,
            )
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {row["ligne__fiche__date__year"]: int(row["total"] or 0) for row in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))
        yearly_data = [yearly_map.get(y, 0) for y in yearly_labels]

        total_year = (
            FicheRecolteDetail.objects.filter(
                secteur=secteur,
                ligne__fiche__date__year=year,
            ).aggregate(total=Sum("quantite"))["total"]
            or 0
        )
        superficie = float(secteur.superficie_ha or 0)
        rendement_ha = round(float(total_year) / superficie, 4) if superficie else 0

        # Top recolteurs sur ce secteur (annee)
        top = (
            Recolteur.objects.filter(
                lignes_recolte__details__secteur=secteur,
                lignes_recolte__fiche__date__year=year,
            )
            .annotate(total=Coalesce(Sum("lignes_recolte__details__quantite"), 0))
            .values("id", "code", "nom", "total")
            .order_by("-total")[:10]
        )

        # Dernieres recoltes sur ce secteur
        fiches = (
            FicheRecolte.objects.filter(lignes__details__secteur=secteur, date__year=year)
            .order_by("-date")
            .distinct()[:10]
        )
        last_rows = []
        for f in fiches:
            qty = (
                FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche=f)
                .aggregate(total=Sum("quantite"))["total"]
                or 0
            )
            last_rows.append({"fiche_id": f.id, "date": f.date, "total_regimes": int(qty)})

        return Response(
            {
                "secteur": {
                    "id": secteur.id,
                    "code": secteur.code,
                    "nom": secteur.nom,
                    "superficie_ha": float(secteur.superficie_ha),
                },
                "year": year,
                "monthly": {"current": monthly_totals(year), "previous": monthly_totals(prev_year)},
                "yearly": {"labels": yearly_labels, "data": yearly_data},
                "stats": {"total_regimes": int(total_year), "rendement_ha": rendement_ha},
                "top_recolteurs": list(top),
                "last_recoltes": last_rows,
            }
        )

    @action(detail=True, methods=["get"], url_path="export")
    def export_details(self, request, pk=None):
        # Export CSV des recoltes pour un secteur (optionnellement filtre par annee)
        secteur = self.get_object()
        today = timezone.now().date()
        year = request.query_params.get("year")
        year = int(year) if year else today.year

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f"attachment; filename=secteur_{secteur.code}_recoltes_{year}.csv"
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "date",
                "recolteur_code",
                "recolteur_nom",
                "regime_type",
                "quantite",
                "fiche_id",
            ]
        )

        qs = (
            FicheRecolteDetail.objects.select_related("ligne__fiche", "ligne__recolteur")
            .filter(secteur=secteur, ligne__fiche__date__year=year)
            .values(
                "ligne__fiche__date",
                "ligne__recolteur__code",
                "ligne__recolteur__nom",
                "ligne__recolteur_nom",
                "ligne__regime_type",
                "quantite",
                "ligne__fiche__id",
            )
            .order_by("ligne__fiche__date")
        )

        for row in qs:
            recolteur_nom = row["ligne__recolteur__nom"] or row["ligne__recolteur_nom"] or ""
            writer.writerow(
                [
                    row["ligne__fiche__date"],
                    row["ligne__recolteur__code"] or "",
                    recolteur_nom,
                    row["ligne__regime_type"],
                    row["quantite"] or 0,
                    row["ligne__fiche__id"],
                ]
            )

        return response
