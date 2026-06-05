import io

from django.http import HttpResponse
from django.db.models import Sum, Count, Max, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from recolteurs.models import Personnel
from utils.permissions import IsAdmin
from accounts.utils import create_notification
from .models import Client, FicheRecolte, FicheRecolteDetail
from .serializers import ClientSerializer, FicheRecolteSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """
    Lecture : tous les utilisateurs authentifiés.
    Création / modification / suppression : administrateur uniquement.
    """
    queryset = Client.objects.all().order_by("nom")
    serializer_class = ClientSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdmin()]
        return super().get_permissions()


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


def _notify_statut_recolte(instance, old_statut, new_statut):
    if not new_statut or new_statut == old_statut or not instance.created_by:
        return
    date_str = str(instance.date) if instance.date else f"#{instance.id}"
    if new_statut == "valide":
        create_notification(instance.created_by,
                            f"Votre fiche de recolte du {date_str} a ete validee.", "success", "/recoltes")
    elif new_statut == "brouillon" and old_statut == "soumis":
        create_notification(instance.created_by,
                            f"Votre fiche de recolte du {date_str} a ete rejetee.", "warning", "/recoltes")


def _is_admin(user):
    try:
        return user.profile.is_admin
    except AttributeError:
        return False


class FicheRecolteViewSet(viewsets.ModelViewSet):
    serializer_class = FicheRecolteSerializer

    def get_queryset(self):
        qs = FicheRecolte.objects.prefetch_related(
            "superviseurs_adjoints", "lignes__details", "recus"
        ).order_by("-id")
        if not _is_admin(self.request.user):
            qs = qs.filter(created_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_permissions(self):
        if self.action in ("export",):
            return [IsAdmin()]
        return super().get_permissions()

    def _check_statut_transition(self, request, instance=None):
        """Vérifie les règles de transition de statut."""
        new_statut = request.data.get("statut")
        if not new_statut:
            return None
        is_admin = _is_admin(request.user)
        if new_statut == "valide" and not is_admin:
            return Response({"detail": "Seul l'administrateur peut valider une fiche."}, status=403)
        if instance and instance.statut == "valide" and not is_admin:
            return Response({"detail": "Seul l'administrateur peut modifier une fiche validée."}, status=403)
        if instance and instance.statut == "valide" and is_admin:
            # Marque l'instance pour l'audit signal
            instance._audit_user = request.user
            instance._audit_motif = request.data.get("motif", "")
        return None

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        err = self._check_statut_transition(request, instance)
        if err:
            return err
        old_statut = instance.statut
        response = super().partial_update(request, *args, **kwargs)
        _notify_statut_recolte(instance, old_statut, request.data.get("statut"))
        return response

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        err = self._check_statut_transition(request, instance)
        if err:
            return err
        old_statut = instance.statut
        response = super().update(request, *args, **kwargs)
        _notify_statut_recolte(instance, old_statut, request.data.get("statut"))
        return response

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        today = timezone.now().date()
        year = int(request.query_params.get("year", today.year))
        prev_year = year - 1

        def monthly_totals(target_year):
            qs = (
                FicheRecolteDetail.objects.filter(ligne__fiche__date__year=target_year)
                .values("ligne__fiche__date__month")
                .annotate(total=Sum("quantite"))
            )
            by_month = {r["ligne__fiche__date__month"]: r["total"] or 0 for r in qs}
            labels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sept", "Oct", "Nov", "Dec"]
            return {"labels": labels, "data": [int(by_month.get(m, 0)) for m in range(1, 13)]}

        start_year = year - 4
        yearly_qs = (
            FicheRecolteDetail.objects.filter(ligne__fiche__date__year__gte=start_year)
            .values("ligne__fiche__date__year")
            .annotate(total=Sum("quantite"))
            .order_by("ligne__fiche__date__year")
        )
        yearly_map = {r["ligne__fiche__date__year"]: r["total"] or 0 for r in yearly_qs}
        yearly_labels = list(range(start_year, year + 1))

        personnel = (
            Personnel.objects.annotate(
                grands=Coalesce(Sum("lignes_recolte__details__quantite",
                                    filter=Q(lignes_recolte__fiche__date__year=year, lignes_recolte__regime_type="grands")), 0),
                moyens=Coalesce(Sum("lignes_recolte__details__quantite",
                                    filter=Q(lignes_recolte__fiche__date__year=year, lignes_recolte__regime_type="moyens")), 0),
                petits=Coalesce(Sum("lignes_recolte__details__quantite",
                                    filter=Q(lignes_recolte__fiche__date__year=year, lignes_recolte__regime_type="petits")), 0),
                total_regimes=Coalesce(Sum("lignes_recolte__details__quantite",
                                           filter=Q(lignes_recolte__fiche__date__year=year)), 0),
                fiches_count=Count("lignes_recolte__fiche", distinct=True,
                                   filter=Q(lignes_recolte__fiche__date__year=year)),
                last_recolte=Max("lignes_recolte__fiche__date", filter=Q(lignes_recolte__fiche__date__year=year)),
            )
            .values("id", "code", "numero_telephone", "nom", "lieu_residence",
                    "grands", "moyens", "petits", "total_regimes", "fiches_count", "last_recolte")
            .order_by("-total_regimes", "nom")
        )

        return Response({
            "year": year,
            "monthly": {"current": monthly_totals(year), "previous": monthly_totals(prev_year)},
            "yearly": {"labels": yearly_labels, "data": [int(yearly_map.get(y, 0)) for y in yearly_labels]},
            "recolteurs": list(personnel),
        })

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Export Excel des fiches de récolte."""
        year = request.query_params.get("year")
        secteur_id = request.query_params.get("secteur")
        today = timezone.now().date()
        year = int(year) if year else today.year

        wb = Workbook()
        ws = wb.active
        ws.title = f"Recoltes {year}"
        headers = ["Date", "Tél. récolteur", "Nom récolteur", "Type régime",
                   "Code secteur", "Quantité", "Fiche ID"]
        _style_header(ws, headers)

        details_qs = FicheRecolteDetail.objects.select_related(
            "ligne__fiche", "ligne__recolteur", "secteur"
        ).filter(ligne__fiche__date__year=year)
        if secteur_id:
            details_qs = details_qs.filter(secteur_id=secteur_id)

        details = (
            details_qs.values(
                "ligne__fiche__date", "ligne__recolteur__numero_telephone",
                "ligne__recolteur__nom", "ligne__recolteur_nom",
                "ligne__regime_type", "secteur__code", "secteur_code",
                "quantite", "ligne__fiche__id",
            ).order_by("ligne__fiche__date")
        )

        total_qty = 0
        for row in details:
            nom = row["ligne__recolteur__nom"] or row["ligne__recolteur_nom"] or ""
            scode = row["secteur__code"] or row["secteur_code"] or ""
            qty = int(row["quantite"] or 0)
            total_qty += qty
            ws.append([str(row["ligne__fiche__date"]), row["ligne__recolteur__numero_telephone"] or "",
                        nom, row["ligne__regime_type"], scode, qty, row["ligne__fiche__id"]])

        total_row = ws.max_row + 1
        ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
        ws.cell(row=total_row, column=6, value=total_qty).font = Font(bold=True)

        return _send_wb(wb, f"recoltes_export_{year}.xlsx")
