import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from utils.permissions import IsIARole
from .services.fonctionnalites_avancees import FonctionnalitesIAAvancees

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsIARole])
def tendances_view(request):
    service = FonctionnalitesIAAvancees(request.user)
    try:
        return Response(service.tendances(
            year=request.query_params.get("year"),
            month=request.query_params.get("month"),
            horizon=request.query_params.get("horizon", 6),
            secteur_id=request.query_params.get("secteur_id"),
        ))
    except Exception as exc:
        logger.exception("Erreur tendance IA")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsIARole])
def assistant_metier_view(request):
    try:
        return Response(FonctionnalitesIAAvancees(request.user).assistant_metier(
            question=request.data.get("question", ""),
            year=request.data.get("year") or request.data.get("annee"),
        ))
    except Exception as exc:
        logger.exception("Erreur assistant IA")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsIARole])
def scoring_recolteurs_view(request):
    try:
        return Response(FonctionnalitesIAAvancees(request.user).scoring_recolteurs(
            year=request.query_params.get("year"),
            month=request.query_params.get("month"),
            limit=request.query_params.get("limit", 20),
        ))
    except Exception as exc:
        logger.exception("Erreur scoring recolteurs IA")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)