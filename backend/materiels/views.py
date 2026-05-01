from rest_framework import viewsets

from .models import MaterielEquipement
from .serializers import MaterielEquipementSerializer


class MaterielEquipementViewSet(viewsets.ModelViewSet):
    queryset = MaterielEquipement.objects.all().order_by("numero")
    serializer_class = MaterielEquipementSerializer
