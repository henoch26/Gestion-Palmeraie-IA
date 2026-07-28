from rest_framework import serializers

from secteurs.models import Secteur
from .models import (
    LotPepiniere,
    LotSemence,
    ObservationSanitaire,
    OperationPlantation,
    SuiviCroissance,
    SuiviPepiniere,
)


class LotSemenceSerializer(serializers.ModelSerializer):
    code_lot = serializers.CharField(read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = LotSemence
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "taux_germination"]

    def validate(self, attrs):
        nombre = attrs.get("nombre_graines", getattr(self.instance, "nombre_graines", 0) if self.instance else 0)
        germees = attrs.get("nombre_graines_germees", getattr(self.instance, "nombre_graines_germees", None) if self.instance else None)
        if nombre is not None and nombre < 0:
            raise serializers.ValidationError({"nombre_graines": "Le nombre de graines doit etre positif."})
        if germees is not None:
            if germees < 0:
                raise serializers.ValidationError({"nombre_graines_germees": "Le nombre de graines germees doit etre positif."})
            if nombre and germees > nombre:
                raise serializers.ValidationError({"nombre_graines_germees": "Les graines germees ne peuvent pas depasser le nombre total."})
        return attrs


class SuiviPepiniereSerializer(serializers.ModelSerializer):
    lot_pepiniere_code = serializers.CharField(source="lot_pepiniere.code_lot", read_only=True)

    class Meta:
        model = SuiviPepiniere
        fields = "__all__"
        read_only_fields = ["created_at"]


class LotPepiniereSerializer(serializers.ModelSerializer):
    lot_semence_code = serializers.CharField(source="lot_semence.code_lot", read_only=True)
    lot_semence_variete = serializers.CharField(source="lot_semence.variete", read_only=True)
    code_lot = serializers.CharField(read_only=True)
    taux_survie = serializers.FloatField(read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    suivis = SuiviPepiniereSerializer(many=True, read_only=True)

    class Meta:
        model = LotPepiniere
        fields = "__all__"
        read_only_fields = ["created_by", "created_at"]

    def validate(self, attrs):
        initial = attrs.get("nombre_plants_initial", getattr(self.instance, "nombre_plants_initial", 0) if self.instance else 0)
        valides = attrs.get("nombre_plants_valides", getattr(self.instance, "nombre_plants_valides", None) if self.instance else None)
        rejetes = attrs.get("nombre_plants_rejetes", getattr(self.instance, "nombre_plants_rejetes", 0) if self.instance else 0)
        morts = attrs.get("nombre_plants_morts", getattr(self.instance, "nombre_plants_morts", 0) if self.instance else 0)
        if valides is not None and initial and valides > initial:
            raise serializers.ValidationError({"nombre_plants_valides": "Les plants valides ne peuvent pas depasser le nombre initial."})
        if initial and (rejetes or 0) + (morts or 0) > initial:
            raise serializers.ValidationError("Les plants rejetes et morts ne peuvent pas depasser le nombre initial.")
        return attrs


class OperationPlantationSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    secteur_nom = serializers.CharField(source="secteur.nom", read_only=True)
    lot_pepiniere_code = serializers.CharField(source="lot_pepiniere.code_lot", read_only=True)
    lot_semence_code = serializers.CharField(source="lot_pepiniere.lot_semence.code_lot", read_only=True)
    code_operation = serializers.CharField(read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = OperationPlantation
        fields = "__all__"
        read_only_fields = ["created_by", "created_at"]

    def validate(self, attrs):
        secteur = attrs.get("secteur", getattr(self.instance, "secteur", None))
        nombre_plants = attrs.get("nombre_plants", getattr(self.instance, "nombre_plants", 0) if self.instance else 0)
        if nombre_plants is not None and nombre_plants <= 0:
            raise serializers.ValidationError({"nombre_plants": "Le nombre de plants doit etre superieur a 0."})
        if secteur and nombre_plants and not attrs.get("densite_plantation"):
            try:
                superficie = float(secteur.superficie_ha or 0)
            except Exception:
                superficie = 0
            if superficie > 0:
                attrs["densite_plantation"] = round(nombre_plants / superficie, 2)
        return attrs


class SuiviCroissanceSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    secteur_nom = serializers.CharField(source="secteur.nom", read_only=True)
    operation_code = serializers.CharField(source="operation_plantation.code_operation", read_only=True)
    etat_general_display = serializers.CharField(source="get_etat_general_display", read_only=True)

    class Meta:
        model = SuiviCroissance
        fields = "__all__"
        read_only_fields = ["created_at"]


class ObservationSanitaireSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    secteur_nom = serializers.CharField(source="secteur.nom", read_only=True)
    operation_code = serializers.CharField(source="operation_plantation.code_operation", read_only=True)
    gravite_display = serializers.CharField(source="get_gravite_display", read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = ObservationSanitaire
        fields = "__all__"
        read_only_fields = ["created_at"]