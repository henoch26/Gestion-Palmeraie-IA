import io

from django.http import HttpResponse
from django.db.models import Sum, Max
from django.db.models.functions import Coalesce
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Secteur
from .serializers import SecteurSerializer
from recoltes.models import FicheRecolte, FicheRecolteDetail
from recolteurs.models import Personnel


def _send_wb(wb, filename: str) -> HttpResponse:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(buf.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


def _style_header(ws, headers, fill_color="1F4E79"):
    fill = PatternFill(fill_type="solid", fgColor=fill_color)
    font = Font(bold=True, color="FFFFFF")
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = font
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center")
    ws.auto_filter.ref = ws.dimensions


class SecteurViewSet(viewsets.ModelViewSet):
    serializer_class = SecteurSerializer

    def get_queryset(self):
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
        """Export Excel — liste des secteurs avec indicateurs."""
        year = request.query_params.get("year")
        year = int(year) if year else timezone.now().year

        wb = Workbook()
        ws = wb.active
        ws.title = "Secteurs"
        headers = ["Code", "Nom", "Superficie (ha)", "Statut", "Nb palmiers",
                   "Âge moyen plants", "Cible rendement (t/ha)",
                   "Production totale (régimes)", "Rendement (rég/ha)", "Dernière récolte"]
        _style_header(ws, headers)

        total_prod = 0
        for s in self.get_queryset().filter(statut="actif").order_by("code"):
            prod = int(getattr(s, "production_total", 0) or 0)
            sup = float(s.superficie_ha or 0)
            rend = round(prod / sup, 4) if sup else 0
            total_prod += prod
            ws.append([
                s.code, s.nom, float(s.superficie_ha),
                s.get_statut_display(),
                s.nb_palmiers or "",
                s.age_moyen_plants or "",
                float(s.rendement_cible_t_ha) if s.rendement_cible_t_ha else "",
                prod, rend,
                str(getattr(s, "last_recolte", None) or ""),
            ])

        total_row = ws.max_row + 1
        ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
        ws.cell(row=total_row, column=8, value=total_prod).font = Font(bold=True)

        return _send_wb(wb, f"secteurs_export_{year}.xlsx")

    @action(detail=True, methods=["get"], url_path="analytics")
    def analytics(self, request, pk=None):
        secteur = self.get_object()
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        month_labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche__date__year=target_year)
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            by_month = {row["ligne__fiche__date__month"]: int(row["total"] or 0) for row in qs}
            return {"labels": month_labels, "data": [by_month.get(m, 0) for m in range(1, 13)]}

        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche__date__year__gte=start_year)
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {r["ligne__fiche__date__year"]: int(r["total"] or 0) for r in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))

        total_year = (
            FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche__date__year=year)
            .aggregate(total=Sum("quantite"))["total"] or 0
        )
        superficie = float(secteur.superficie_ha or 0)
        rendement_ha = round(float(total_year) / superficie, 4) if superficie else 0

        top = (
            Personnel.objects.filter(
                lignes_recolte__details__secteur=secteur,
                lignes_recolte__fiche__date__year=year,
            )
            .annotate(total=Coalesce(Sum("lignes_recolte__details__quantite"), 0))
            .values("id", "code", "nom", "total")
            .order_by("-total")[:10]
        )

        fiches = (
            FicheRecolte.objects.filter(lignes__details__secteur=secteur, date__year=year)
            .order_by("-date").distinct()[:10]
        )
        last_rows = []
        for f in fiches:
            qty = (
                FicheRecolteDetail.objects.filter(secteur=secteur, ligne__fiche=f)
                .aggregate(total=Sum("quantite"))["total"] or 0
            )
            last_rows.append({"fiche_id": f.id, "date": f.date, "total_regimes": int(qty)})

        return Response({
            "secteur": {
                "id": secteur.id, "code": secteur.code, "nom": secteur.nom,
                "superficie_ha": float(secteur.superficie_ha),
                "statut": secteur.statut,
                "nb_palmiers": secteur.nb_palmiers,
                "rendement_cible_t_ha": float(secteur.rendement_cible_t_ha) if secteur.rendement_cible_t_ha else None,
            },
            "year": year,
            "monthly": {"current": monthly_totals(year), "previous": monthly_totals(prev_year)},
            "yearly": {"labels": yearly_labels, "data": [yearly_map.get(y, 0) for y in yearly_labels]},
            "stats": {"total_regimes": int(total_year), "rendement_ha": rendement_ha},
            "top_recolteurs": list(top),
            "last_recoltes": last_rows,
        })

    @action(detail=True, methods=["get"], url_path="export")
    def export_details(self, request, pk=None):
        """Export Excel des récoltes pour un secteur."""
        secteur = self.get_object()
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))

        wb = Workbook()
        ws = wb.active
        ws.title = f"Secteur {secteur.code}"
        headers = ["Date", "Code récolteur", "Nom récolteur", "Type régime", "Quantité", "Fiche ID"]
        _style_header(ws, headers)

        qs = (
            FicheRecolteDetail.objects.select_related("ligne__fiche", "ligne__recolteur")
            .filter(secteur=secteur, ligne__fiche__date__year=year)
            .values("ligne__fiche__date", "ligne__recolteur__code",
                    "ligne__recolteur__nom", "ligne__recolteur_nom",
                    "ligne__regime_type", "quantite", "ligne__fiche__id")
            .order_by("ligne__fiche__date")
        )

        total_qty = 0
        for row in qs:
            nom = row["ligne__recolteur__nom"] or row["ligne__recolteur_nom"] or ""
            qty = int(row["quantite"] or 0)
            total_qty += qty
            ws.append([str(row["ligne__fiche__date"]), row["ligne__recolteur__code"] or "",
                        nom, row["ligne__regime_type"], qty, row["ligne__fiche__id"]])

        total_row = ws.max_row + 1
        ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
        ws.cell(row=total_row, column=5, value=total_qty).font = Font(bold=True)

        return _send_wb(wb, f"secteur_{secteur.code}_recoltes_{year}.xlsx")
