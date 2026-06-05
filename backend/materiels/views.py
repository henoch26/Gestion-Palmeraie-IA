import io

from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from rest_framework import viewsets
from rest_framework.decorators import action

from utils.permissions import IsAdmin
from .models import MaterielEquipement, MaterielUtiliseTravaux
from .serializers import MaterielEquipementSerializer, MaterielUtiliseTravauxSerializer


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
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = font; c.fill = fill; c.alignment = Alignment(horizontal="center")
    ws.auto_filter.ref = ws.dimensions


class MaterielEquipementViewSet(viewsets.ModelViewSet):
    queryset = MaterielEquipement.objects.all().order_by("numero")
    serializer_class = MaterielEquipementSerializer

    def get_permissions(self):
        if self.action in ("export",):
            return [IsAdmin()]
        return super().get_permissions()

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Export Excel du stock de matériels."""
        wb = Workbook()
        ws = wb.active
        ws.title = "Matériels"
        headers = ["N°", "Désignation", "Quantité", "Catégorie", "État physique",
                   "Statut utilisation", "Fournisseur", "Date acquisition",
                   "Valeur achat", "Localisation", "Responsable",
                   "Dernière maintenance", "Prochaine maintenance"]
        _style_header(ws, headers)

        total_val = 0
        for m in MaterielEquipement.objects.all().order_by("numero"):
            val = float(m.valeur_achat or 0)
            total_val += val
            ws.append([
                m.numero, m.designation or "", m.quantite,
                m.get_categorie_display() if m.categorie else "",
                m.etat_physique or "", m.statut_utilisation or "",
                m.fournisseur or "",
                str(m.date_acquisition) if m.date_acquisition else "",
                val if val else "",
                m.localisation or "", m.responsable or "",
                str(m.date_derniere_maintenance) if m.date_derniere_maintenance else "",
                str(m.date_prochaine_maintenance) if m.date_prochaine_maintenance else "",
            ])

        tr = ws.max_row + 1
        ws.cell(tr, 1, "TOTAL").font = Font(bold=True)
        ws.cell(tr, 9, round(total_val, 2)).font = Font(bold=True)

        return _send_wb(wb, f"materiels_export_{timezone.now().year}.xlsx")


class MaterielUtiliseTravauxViewSet(viewsets.ModelViewSet):
    queryset = MaterielUtiliseTravaux.objects.all().order_by("-id")
    serializer_class = MaterielUtiliseTravauxSerializer
