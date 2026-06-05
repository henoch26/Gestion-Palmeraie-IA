import io

from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from utils.permissions import IsAdmin
from accounts.utils import create_notification
from .models import FicheTravaux
from .serializers import FicheTravauxSerializer


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


def _notify_statut_travaux(instance, old_statut, new_statut):
    if not new_statut or new_statut == old_statut or not instance.created_by:
        return
    ref = str(instance.periode_travaux) if instance.periode_travaux else f"#{instance.id}"
    if new_statut == "valide":
        create_notification(instance.created_by,
                            f"Votre fiche de travaux ({ref}) a ete validee.", "success", "/travaux")
    elif new_statut == "brouillon" and old_statut == "soumis":
        create_notification(instance.created_by,
                            f"Votre fiche de travaux ({ref}) a ete rejetee.", "warning", "/travaux")


def _is_admin(user):
    try:
        return user.profile.is_admin
    except AttributeError:
        return False


class FicheTravauxViewSet(viewsets.ModelViewSet):
    serializer_class = FicheTravauxSerializer

    def get_queryset(self):
        qs = FicheTravaux.objects.prefetch_related(
            "secteurs_couverts", "consommables", "repartitions"
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
        new_statut = request.data.get("statut")
        is_admin = _is_admin(request.user)
        if new_statut == "valide" and not is_admin:
            return Response({"detail": "Seul l'administrateur peut valider une fiche."}, status=403)
        if instance and instance.statut == "valide" and not is_admin:
            return Response({"detail": "Seul l'administrateur peut modifier une fiche validée."}, status=403)
        if instance and instance.statut == "valide" and is_admin:
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
        _notify_statut_travaux(instance, old_statut, request.data.get("statut"))
        return response

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        err = self._check_statut_transition(request, instance)
        if err:
            return err
        old_statut = instance.statut
        response = super().update(request, *args, **kwargs)
        _notify_statut_travaux(instance, old_statut, request.data.get("statut"))
        return response

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Export Excel des fiches de travaux."""
        year = request.query_params.get("year")
        today = timezone.now().date()
        year = int(year) if year else today.year

        wb = Workbook()
        ws_cons = wb.active
        ws_cons.title = "Consommables"
        ws_taches = wb.create_sheet("Tâches")

        headers_cons = ["Fiche ID", "Superviseur", "Nature travaux", "Superficie (ha)",
                         "Période", "Nb personnes", "Secteurs", "Désignation",
                         "Quantité", "Unité", "Prix unit.", "Prix total", "Fournisseur"]
        headers_taches = ["Fiche ID", "Superviseur", "Nature travaux", "Période",
                           "Secteurs", "Nom/Prénom", "Nature tâche", "Quantité",
                           "Prix unit.", "Salaire total", "Matricule"]
        _style_header(ws_cons, headers_cons)
        _style_header(ws_taches, headers_taches)

        total_cons = 0
        total_taches_sum = 0

        fiches = self.get_queryset().filter(created_at__year=year)
        for fiche in fiches:
            secteurs_codes = ", ".join(fiche.secteurs_couverts.values_list("code", flat=True))
            for c in fiche.consommables.all():
                prix = float((c.quantite or 0) * (c.prix_unitaire or 0))
                total_cons += prix
                ws_cons.append([
                    fiche.id, fiche.superviseur_travaux, fiche.nature_travaux,
                    float(fiche.superficie_couverte_ha or 0) or "",
                    fiche.periode_travaux, fiche.nb_personnes or "", secteurs_codes,
                    c.designation, float(c.quantite), c.unite, float(c.prix_unitaire), prix,
                    c.fournisseur or "",
                ])
            for r in fiche.repartitions.all():
                sal = float((r.quantite or 0) * (r.prix_unitaire or 0))
                total_taches_sum += sal
                ws_taches.append([
                    fiche.id, fiche.superviseur_travaux, fiche.nature_travaux,
                    fiche.periode_travaux, secteurs_codes,
                    r.nom_prenom, r.nature_taches, float(r.quantite),
                    float(r.prix_unitaire), sal, r.matricule_ouvrier or "",
                ])

        # Totaux
        tr = ws_cons.max_row + 1
        ws_cons.cell(tr, 1, "TOTAL").font = Font(bold=True)
        ws_cons.cell(tr, 12, round(total_cons, 2)).font = Font(bold=True)
        tr2 = ws_taches.max_row + 1
        ws_taches.cell(tr2, 1, "TOTAL").font = Font(bold=True)
        ws_taches.cell(tr2, 10, round(total_taches_sum, 2)).font = Font(bold=True)

        return _send_wb(wb, f"travaux_export_{year}.xlsx")
