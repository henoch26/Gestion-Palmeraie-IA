from rest_framework import serializers

from .models import Anomalie, FacteurProduction, ParametreIA, PredictionScenario


class FacteurProductionSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    secteur_nom = serializers.CharField(source="secteur.nom", read_only=True)

    class Meta:
        model = FacteurProduction
        fields = "__all__"
        read_only_fields = ("created_at", "updated_at")

    def validate(self, attrs):
        month = attrs.get("month", getattr(self.instance, "month", None))
        if month is not None and not (1 <= int(month) <= 12):
            raise serializers.ValidationError({"month": "Le mois doit etre compris entre 1 et 12."})

        year = attrs.get("year", getattr(self.instance, "year", None))
        if year is not None and int(year) < 2000:
            raise serializers.ValidationError({"year": "L'annee doit etre superieure ou egale a 2000."})

        for field in ["humidite_air_pct", "humidite_sol_pct", "absenteisme_pct", "niveau_infestation", "severite_incident"]:
            value = attrs.get(field, getattr(self.instance, field, None))
            if value is not None and not (0 <= float(value) <= 100):
                raise serializers.ValidationError({field: "La valeur doit etre comprise entre 0 et 100."})

        ph = attrs.get("ph_sol", getattr(self.instance, "ph_sol", None))
        if ph is not None and not (0 <= float(ph) <= 14):
            raise serializers.ValidationError({"ph_sol": "Le pH doit etre compris entre 0 et 14."})

        return attrs


class ParametreIASerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreIA
        fields = ["id", "key", "value", "description", "updated_at"]


class PredictionScenarioSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    secteur_nom = serializers.CharField(source="secteur.nom", read_only=True)

    class Meta:
        model = PredictionScenario
        fields = [
            "id",
            "created_at",
            "algorithm",
            "year",
            "horizon_months",
            "secteur",
            "secteur_code",
            "secteur_nom",
            "metrics",
            "predictions",
        ]
        read_only_fields = ("created_at", "algorithm", "metrics", "predictions")


class AnomalieSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(source="secteur.code", read_only=True)
    recolteur_code = serializers.CharField(source="recolteur.code", read_only=True)

    class Meta:
        model = Anomalie
        fields = [
            "id",
            "created_at",
            "year",
            "month",
            "date",
            "type",
            "niveau",
            "metric",
            "value",
            "expected_min",
            "expected_max",
            "message",
            "details",
            "secteur",
            "secteur_code",
            "recolteur",
            "recolteur_code",
            "fiche",
            "resolved",
            "resolved_at",
        ]
        read_only_fields = ("created_at", "resolved_at")


class AnomalieResolveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Anomalie
        fields = ["resolved"]
