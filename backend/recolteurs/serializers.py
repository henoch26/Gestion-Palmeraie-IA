from rest_framework import serializers
from .models import Personnel


class PersonnelSerializer(serializers.ModelSerializer):
    code = serializers.CharField(read_only=True)
    operateur_mm_display = serializers.CharField(
        source="get_operateur_mm_display", read_only=True
    )
    contrat_display = serializers.CharField(source="get_contrat_display", read_only=True)

    class Meta:
        model = Personnel
        fields = [
            "id",
            "code",
            "nom",
            "lieu_residence",
            "numero_telephone",
            "telephone",
            "numero_whatsapp",
            "whatsapp_actif",
            "est_wave",
            "est_mobile_money",
            "operateur_mm",
            "operateur_mm_display",
            "date_naissance",
            "photo",
            "contrat",
            "contrat_display",
            "date_embauche",
            "created_at",
        ]
        read_only_fields = ("code", "created_at")

    def validate_numero_telephone(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Le numéro de téléphone est obligatoire.")
        qs = Personnel.objects.filter(numero_telephone=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ce numéro de téléphone est déjà utilisé.")
        return value

    def validate(self, attrs):
        if attrs.get("est_mobile_money") and not attrs.get("operateur_mm"):
            raise serializers.ValidationError(
                {"operateur_mm": "Sélectionner un opérateur Mobile Money."}
            )
        if not attrs.get("est_mobile_money", getattr(self.instance, "est_mobile_money", False)):
            attrs["operateur_mm"] = ""
        return attrs


# Alias pour la rétrocompatibilité des imports existants
RecolteurSerializer = PersonnelSerializer
