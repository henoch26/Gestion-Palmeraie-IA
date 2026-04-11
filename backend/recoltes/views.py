import csv
from django.http import HttpResponse
from django.db.models import Sum, Count, Max, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from recolteurs.models import Recolteur
from .models import FicheRecolte, FicheRecolteDetail
from .serializers import FicheRecolteSerializer


class FicheRecolteViewSet(viewsets.ModelViewSet):
    # CRUD complet pour les fiches de recolte (avec prefetch)
    queryset = FicheRecolte.objects.all().prefetch_related(
        "superviseurs_adjoints",
        "lignes__details",
        "recus",
    ).order_by("-id")
    serializer_class = FicheRecolteSerializer

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        # Stats globales + comparaisons annuelles
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(ligne__fiche__date__year=target_year)
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            totals_by_month = {row["ligne__fiche__date__month"]: row["total"] or 0 for row in qs}
            labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]
            data = [int(totals_by_month.get(m, 0)) for m in range(1, 13)]
            return {"labels": labels, "data": data}

        # Totaux par annee (5 ans glissants)
        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(ligne__fiche__date__year__gte=start_year)
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {row["ligne__fiche__date__year"]: row["total"] or 0 for row in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))
        yearly_data = [int(yearly_map.get(y, 0)) for y in yearly_labels]

        # Stats par recolteur (grands / moyens / petits)
        recolteurs = (
            Recolteur.objects.annotate(
                grands=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="grands",
                        ),
                    ),
                    0,
                ),
                moyens=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="moyens",
                        ),
                    ),
                    0,
                ),
                petits=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(
                            lignes_recolte__fiche__date__year=year,
                            lignes_recolte__regime_type="petits",
                        ),
                    ),
                    0,
                ),
                total_regimes=Coalesce(
                    Sum(
                        "lignes_recolte__details__quantite",
                        filter=Q(lignes_recolte__fiche__date__year=year),
                    ),
                    0,
                ),
                fiches_count=Count(
                    "lignes_recolte__fiche",
                    distinct=True,
                    filter=Q(lignes_recolte__fiche__date__year=year),
                ),
                last_recolte=Max(
                    "lignes_recolte__fiche__date",
                    filter=Q(lignes_recolte__fiche__date__year=year),
                ),
            )
            .values(
                "id",
                "code",
                "nom",
                "lieu_residence",
                "grands",
                "moyens",
                "petits",
                "total_regimes",
                "fiches_count",
                "last_recolte",
            )
            .order_by("-total_regimes", "nom")
        )

        return Response(
            {
                "year": year,
                "monthly": {
                    "current": monthly_totals(year),
                    "previous": monthly_totals(prev_year),
                },
                "yearly": {"labels": yearly_labels, "data": yearly_data},
                "recolteurs": list(recolteurs),
            }
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # Export CSV des details de recolte
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = "attachment; filename=recoltes_export.csv"

        writer = csv.writer(response)
        writer.writerow(
            [
                "date",
                "recolteur_code",
                "recolteur_nom",
                "regime_type",
                "secteur_code",
                "quantite",
                "fiche_id",
            ]
        )

        details = (
            FicheRecolteDetail.objects.select_related(
                "ligne__fiche", "ligne__recolteur", "secteur"
            )
            .values(
                "ligne__fiche__date",
                "ligne__recolteur__code",
                "ligne__recolteur__nom",
                "ligne__recolteur_nom",
                "ligne__regime_type",
                "secteur__code",
                "secteur_code",
                "quantite",
                "ligne__fiche__id",
            )
            .order_by("ligne__fiche__date")
        )

        for row in details:
            recolteur_nom = row["ligne__recolteur__nom"] or row["ligne__recolteur_nom"] or ""
            secteur_code = row["secteur__code"] or row["secteur_code"] or ""
            writer.writerow(
                [
                    row["ligne__fiche__date"],
                    row["ligne__recolteur__code"] or "",
                    recolteur_nom,
                    row["ligne__regime_type"],
                    secteur_code,
                    row["quantite"] or 0,
                    row["ligne__fiche__id"],
                ]
            )

        return response
