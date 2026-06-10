from rest_framework import serializers
from .models import AgentTerrain, SuperviseurGeneral


class SuperviseurGeneralSerializer(serializers.ModelSerializer):
    nom_complet = serializers.SerializerMethodField()

    class Meta:
        model = SuperviseurGeneral
        fields = ["id", "code", "nom", "prenom", "nom_complet", "matricule", "telephone", "actif", "created_at"]
        read_only_fields = ["code", "created_at"]

    def get_nom_complet(self, obj):
        return f"{obj.nom} {obj.prenom}".strip()

    def validate_nom(self, value):
        value = " ".join(value.split()).strip()
        if not value:
            raise serializers.ValidationError("Le nom est requis.")
        return value


class AgentTerrainSerializer(serializers.ModelSerializer):
    secteur_display = serializers.CharField(source="secteur.code", read_only=True, default=None)
    nom_complet = serializers.SerializerMethodField()

    class Meta:
        model = AgentTerrain
        fields = [
            "id", "nom", "prenom", "nom_complet",
            "matricule", "telephone",
            "secteur", "secteur_display",
            "actif", "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_nom_complet(self, obj):
        return f"{obj.nom} {obj.prenom}".strip()

    def validate_nom(self, value):
        value = " ".join(value.split()).strip()
        if not value:
            raise serializers.ValidationError("Le nom est requis.")
        return value
