from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from secteurs.models import Secteur

from .models import (
    LotPepiniere,
    LotSemence,
    ObservationSanitaire,
    OperationPlantation,
    SuiviCroissance,
    SuiviPepiniere,
)
from .serializers import (
    LotPepiniereSerializer,
    LotSemenceSerializer,
    ObservationSanitaireSerializer,
    OperationPlantationSerializer,
    SuiviCroissanceSerializer,
    SuiviPepiniereSerializer,
)
from .services import ContexteAgronomiqueService


class CreatedByMixin:
    def perform_create(self, serializer):
        kwargs = {}
        if hasattr(serializer.Meta.model, "created_by"):
            kwargs["created_by"] = self.request.user if self.request.user.is_authenticated else None
        serializer.save(**kwargs)


class LotSemenceViewSet(CreatedByMixin, viewsets.ModelViewSet):
    serializer_class = LotSemenceSerializer

    def get_queryset(self):
        qs = LotSemence.objects.all()
        statut = self.request.query_params.get("statut")
        variete = self.request.query_params.get("variete")
        if statut:
            qs = qs.filter(statut=statut)
        if variete:
            qs = qs.filter(variete__icontains=variete)
        return qs.order_by("-date_acquisition", "-id")


class LotPepiniereViewSet(CreatedByMixin, viewsets.ModelViewSet):
    serializer_class = LotPepiniereSerializer

    def get_queryset(self):
        qs = LotPepiniere.objects.select_related("lot_semence", "created_by").prefetch_related("suivis")
        statut = self.request.query_params.get("statut")
        lot_semence = self.request.query_params.get("lot_semence")
        if statut:
            qs = qs.filter(statut=statut)
        if lot_semence:
            qs = qs.filter(lot_semence_id=lot_semence)
        return qs.order_by("-date_entree", "-id")


class SuiviPepiniereViewSet(viewsets.ModelViewSet):
    serializer_class = SuiviPepiniereSerializer

    def get_queryset(self):
        qs = SuiviPepiniere.objects.select_related("lot_pepiniere")
        lot_pepiniere = self.request.query_params.get("lot_pepiniere")
        if lot_pepiniere:
            qs = qs.filter(lot_pepiniere_id=lot_pepiniere)
        return qs.order_by("-date_observation", "-id")


class OperationPlantationViewSet(CreatedByMixin, viewsets.ModelViewSet):
    serializer_class = OperationPlantationSerializer

    def get_queryset(self):
        qs = OperationPlantation.objects.select_related(
            "secteur", "lot_pepiniere", "lot_pepiniere__lot_semence", "created_by"
        )
        secteur = self.request.query_params.get("secteur")
        lot_pepiniere = self.request.query_params.get("lot_pepiniere")
        statut = self.request.query_params.get("statut")
        if secteur:
            qs = qs.filter(secteur_id=secteur)
        if lot_pepiniere:
            qs = qs.filter(lot_pepiniere_id=lot_pepiniere)
        if statut:
            qs = qs.filter(statut=statut)
        return qs.order_by("-date_plantation", "-id")

    @action(detail=True, methods=["get"], url_path="historique")
    def historique(self, request, pk=None):
        operation = self.get_object()
        return Response({
            "operation": OperationPlantationSerializer(operation, context={"request": request}).data,
            "lot_pepiniere": LotPepiniereSerializer(operation.lot_pepiniere, context={"request": request}).data,
            "lot_semence": LotSemenceSerializer(operation.lot_pepiniere.lot_semence, context={"request": request}).data,
            "suivis_croissance": SuiviCroissanceSerializer(operation.suivis_croissance.all(), many=True).data,
            "observations_sanitaires": ObservationSanitaireSerializer(operation.observations_sanitaires.all(), many=True).data,
        })

class ContexteAgronomiqueViewSet(viewsets.ViewSet):
    service_class = ContexteAgronomiqueService

    def list(self, request):
        service = self.service_class()
        secteur_id = request.query_params.get("secteur")
        try:
            date_reference = service.parse_date_reference(request.query_params.get("date_reference"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if secteur_id:
            secteur = get_object_or_404(Secteur, pk=secteur_id)
            return Response(service.construire_pour_secteur(secteur, date_reference))

        return Response(service.lister_contextes(date_reference=date_reference))

    def retrieve(self, request, pk=None):
        service = self.service_class()
        try:
            date_reference = service.parse_date_reference(request.query_params.get("date_reference"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        secteur = get_object_or_404(Secteur, pk=pk)
        return Response(service.construire_pour_secteur(secteur, date_reference))

class SuiviCroissanceViewSet(viewsets.ModelViewSet):
    serializer_class = SuiviCroissanceSerializer

    def get_queryset(self):
        qs = SuiviCroissance.objects.select_related("secteur", "operation_plantation")
        secteur = self.request.query_params.get("secteur")
        operation = self.request.query_params.get("operation_plantation")
        etat = self.request.query_params.get("etat_general")
        if secteur:
            qs = qs.filter(secteur_id=secteur)
        if operation:
            qs = qs.filter(operation_plantation_id=operation)
        if etat:
            qs = qs.filter(etat_general=etat)
        return qs.order_by("-date_observation", "-id")


class ObservationSanitaireViewSet(viewsets.ModelViewSet):
    serializer_class = ObservationSanitaireSerializer

    def get_queryset(self):
        qs = ObservationSanitaire.objects.select_related("secteur", "operation_plantation")
        secteur = self.request.query_params.get("secteur")
        operation = self.request.query_params.get("operation_plantation")
        gravite = self.request.query_params.get("gravite")
        statut = self.request.query_params.get("statut")
        if secteur:
            qs = qs.filter(secteur_id=secteur)
        if operation:
            qs = qs.filter(operation_plantation_id=operation)
        if gravite:
            qs = qs.filter(gravite=gravite)
        if statut:
            qs = qs.filter(statut=statut)
        return qs.order_by("-date_observation", "-id")