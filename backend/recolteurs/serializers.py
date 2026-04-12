from rest_framework import serializers
from .models import Recolteur


class RecolteurSerializer(serializers.ModelSerializer):
    code = serializers.CharField(read_only=True)

    class Meta:
        model = Recolteur
        fields = "__all__"
        read_only_fields = ("code", "created_at")
