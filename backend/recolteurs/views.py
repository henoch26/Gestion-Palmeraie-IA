import csv

from django.http import HttpResponse
from django.db.models import Sum, Count, Max, Q
from django.db.models.functions import Coalesce
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecolteLigne
from .models import Recolteur
from .serializers import RecolteurSerializer


class RecolteurViewSet(viewsets.ModelViewSet):
    # CRUD complet pour les recolteurs
    queryset = Recolteur.objects.all().order_by("-id")
    serializer_class = RecolteurSerializer

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        # Tableau de stats recolteurs (annee selectionnee)
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))

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

        return Response({"year": year, "recolteurs": list(recolteurs)})

    @action(detail=True, methods=["get"], url_path="analytics")
    def analytics(self, request, pk=None):
        recolteur = self.get_object()
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        month_labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(
                    ligne__recolteur=recolteur,
                    ligne__fiche__date__year=target_year,
                )
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            by_month = {row["ligne__fiche__date__month"]: int(row["total"] or 0) for row in qs}
            data = [by_month.get(m, 0) for m in range(1, 13)]
            return {"labels": month_labels, "data": data}

        # Totaux par annee (5 ans)
        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(
                ligne__recolteur=recolteur,
                ligne__fiche__date__year__gte=start_year,
            )
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {row["ligne__fiche__date__year"]: int(row["total"] or 0) for row in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))
        yearly_data = [yearly_map.get(y, 0) for y in yearly_labels]

        # Totaux par type de regime (annee)
        base = (
            Recolteur.objects.filter(id=recolteur.id)
            .annotate(
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
            )
            .values("grands", "moyens", "petits", "total_regimes")
            .first()
            or {}
        )

        # Dernieres fiches (detail + prix)
        fiches = (
            FicheRecolte.objects.filter(lignes__recolteur=recolteur, date__year=year)
            .prefetch_related(
                Prefetch(
                    "lignes",
                    queryset=FicheRecolteLigne.objects.filter(recolteur=recolteur)
                    .prefetch_related("details")
                    .select_related("fiche"),
                )
            )
            .order_by("-date")
            .distinct()[:15]
        )

        last_rows = []
        for f in fiches:
            totals = {"grands": 0, "moyens": 0, "petits": 0}
            prix_total = 0
            rates = {
                "grands": int(getattr(f, "bareme_grands", 0) or 0),
                "moyens": int(getattr(f, "bareme_moyens", 0) or 0),
                "petits": int(getattr(f, "bareme_petits", 0) or 0),
            }
            for line in f.lignes.all():
                qty = sum(int(d.quantite or 0) for d in line.details.all())
                totals[line.regime_type] = totals.get(line.regime_type, 0) + qty
                prix_total += qty * int(rates.get(line.regime_type, 0) or 0)

            total_reg = totals["grands"] + totals["moyens"] + totals["petits"]
            last_rows.append(
                {
                    "fiche_id": f.id,
                    "date": f.date,
                    "grands": totals["grands"],
                    "moyens": totals["moyens"],
                    "petits": totals["petits"],
                    "total_regimes": total_reg,
                    "prix_fcfa": prix_total,
                }
            )

        return Response(
            {
                "recolteur": {
                    "id": recolteur.id,
                    "code": recolteur.code,
                    "nom": recolteur.nom,
                    "lieu_residence": recolteur.lieu_residence,
                },
                "year": year,
                "monthly": {"current": monthly_totals(year), "previous": monthly_totals(prev_year)},
                "yearly": {"labels": yearly_labels, "data": yearly_data},
                "stats": base,
                "last_fiches": last_rows,
            }
        )

    @action(detail=True, methods=["get"], url_path="export")
    def export(self, request, pk=None):
        recolteur = self.get_object()
        today = timezone.now().date()
        year = request.query_params.get("year")
        year = int(year) if year else today.year

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f"attachment; filename=recolteur_{recolteur.code}_recoltes_{year}.csv"
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "date",
                "secteur_code",
                "regime_type",
                "quantite",
                "fiche_id",
            ]
        )

        details = (
            FicheRecolteDetail.objects.select_related("ligne__fiche", "secteur")
            .filter(ligne__recolteur=recolteur, ligne__fiche__date__year=year)
            .values(
                "ligne__fiche__date",
                "secteur__code",
                "secteur_code",
                "ligne__regime_type",
                "quantite",
                "ligne__fiche__id",
            )
            .order_by("ligne__fiche__date")
        )

        for row in details:
            secteur_code = row["secteur__code"] or row["secteur_code"] or ""
            writer.writerow(
                [
                    row["ligne__fiche__date"],
                    secteur_code,
                    row["ligne__regime_type"],
                    row["quantite"] or 0,
                    row["ligne__fiche__id"],
                ]
            )

        return response

    @action(detail=False, methods=["get"], url_path="export")
    def export_list(self, request):
        # Export CSV (liste recolteurs) + option stats sur une annee
        today = timezone.now().date()
        year = request.query_params.get("year")
        year = int(year) if year else today.year

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f"attachment; filename=recolteurs_export_{year}.csv"
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "code",
                "nom",
                "lieu_residence",
                "grands",
                "moyens",
                "petits",
                "total_regimes",
                "fiches_count",
                "last_recolte",
            ]
        )

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
            .order_by("nom")
        )

        for r in recolteurs:
            writer.writerow(
                [
                    r.code,
                    r.nom,
                    r.lieu_residence,
                    int(getattr(r, "grands", 0) or 0),
                    int(getattr(r, "moyens", 0) or 0),
                    int(getattr(r, "petits", 0) or 0),
                    int(getattr(r, "total_regimes", 0) or 0),
                    int(getattr(r, "fiches_count", 0) or 0),
                    getattr(r, "last_recolte", None) or "",
                ]
            )

        return response

