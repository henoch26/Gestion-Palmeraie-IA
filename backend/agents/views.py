from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import AgentTerrain
from .serializers import AgentTerrainSerializer


class AgentTerrainViewSet(viewsets.ModelViewSet):
    queryset = AgentTerrain.objects.select_related("secteur").order_by("nom", "prenom")
    serializer_class = AgentTerrainSerializer

    def get_permissions(self):
        return [IsAuthenticated()]
