from rest_framework import serializers

from .models import MaterielEquipement


class MaterielEquipementSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterielEquipement
        fields = "__all__"

