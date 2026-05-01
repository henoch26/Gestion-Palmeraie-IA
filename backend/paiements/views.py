import csv

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Paiement
from .serializers import PaiementSerializer, PaiementUpdateSerializer
from .services import set_paiement_statut, sync_paiements_for_fiche
from recoltes.models import FicheRecolte


class PaiementViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Paiement.objects.select_related("fiche", "recolteur").all().order_by("-fiche__date", "-id")
    serializer_class = PaiementSerializer

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return PaiementUpdateSerializer
        return PaiementSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")
        statut = self.request.query_params.get("statut")
        recolteur = self.request.query_params.get("recolteur")
        fiche = self.request.query_params.get("fiche")
        obsolete = self.request.query_params.get("obsolete")

        if year:
            qs = qs.filter(fiche__date__year=int(year))
        if month:
            qs = qs.filter(fiche__date__month=int(month))
        if statut:
            qs = qs.filter(statut=statut)
        if recolteur:
            qs = qs.filter(recolteur_id=int(recolteur))
        if fiche:
            qs = qs.filter(fiche_id=int(fiche))
        if obsolete in {"0", "1"}:
            qs = qs.filter(is_obsolete=(obsolete == "1"))

        return qs

    def update(self, request, *args, **kwargs):
        paiement = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        statut = serializer.validated_data["statut"]
        set_paiement_statut(paiement, statut)

        return Response(PaiementSerializer(paiement).data)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        # Resume des paiements par recolteur (annee/mois)
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        year = int(year) if year else timezone.now().year

        qs = self.get_queryset().filter(fiche__date__year=year, is_obsolete=False)
        if month:
            qs = qs.filter(fiche__date__month=int(month))

        by_recolteur = {}
        for p in qs:
            key = str(p.recolteur_id) if p.recolteur_id else f"name:{p.recolteur_nom or 'Sans nom'}"
            label = p.recolteur.nom if p.recolteur else (p.recolteur_nom or "Sans nom")
            row = by_recolteur.setdefault(
                key,
                {
                    "recolteur_id": p.recolteur_id,
                    "recolteur_nom": label,
                    "montant_total": 0,
                    "total_regimes": 0,
                    "count": 0,
                    "paye_count": 0,
                    "en_attente_count": 0,
                    "annule_count": 0,
                },
            )

            row["montant_total"] += int(p.montant_fcfa or 0)
            row["total_regimes"] += int(p.total_regimes or 0)
            row["count"] += 1
            if p.statut == Paiement.STATUT_PAYE:
                row["paye_count"] += 1
            elif p.statut == Paiement.STATUT_ANNULE:
                row["annule_count"] += 1
            else:
                row["en_attente_count"] += 1

        rows = sorted(by_recolteur.values(), key=lambda r: (-r["montant_total"], r["recolteur_nom"]))
        return Response({"year": year, "month": int(month) if month else None, "rows": rows})

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # Export CSV (paiements)
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        year = int(year) if year else timezone.now().year

        qs = self.get_queryset().filter(fiche__date__year=year, is_obsolete=False)
        if month:
            qs = qs.filter(fiche__date__month=int(month))

        response = HttpResponse(content_type="text/csv")
        suffix = f"_{year}" + (f"_{int(month):02d}" if month else "")
        response["Content-Disposition"] = f"attachment; filename=paiements{suffix}.csv"

        writer = csv.writer(response)
        writer.writerow(
            [
                "date",
                "fiche_id",
                "recolteur_id",
                "recolteur_nom",
                "statut",
                "grands",
                "moyens",
                "petits",
                "total_regimes",
                "montant_fcfa",
                "paid_at",
            ]
        )

        for p in qs.order_by("fiche__date", "recolteur_nom"):
            label = p.recolteur.nom if p.recolteur else (p.recolteur_nom or "Sans nom")
            writer.writerow(
                [
                    p.fiche.date,
                    p.fiche_id,
                    p.recolteur_id or "",
                    label,
                    p.statut,
                    int(p.regimes_grands or 0),
                    int(p.regimes_moyens or 0),
                    int(p.regimes_petits or 0),
                    int(p.total_regimes or 0),
                    int(p.montant_fcfa or 0),
                    p.paid_at.isoformat() if p.paid_at else "",
                ]
            )

        return response

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        # (Re)calcul des paiements. Optionnellement filtre par year.
        year = request.query_params.get("year")
        qs = FicheRecolte.objects.all().order_by("-date")
        if year:
            qs = qs.filter(date__year=int(year))

        updated = 0
        for fiche in qs.iterator():
            sync_paiements_for_fiche(fiche)
            updated += 1

        return Response({"ok": True, "fiches_processed": updated})

