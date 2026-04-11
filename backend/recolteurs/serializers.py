from rest_framework import serializers
from .models import Recolteur


class RecolteurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recolteur
        fields = "__all__"
