from rest_framework import serializers
from .models import Personnel


class PersonnelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Personnel
        fields = [
            "id",
            "nom",
            "lieu_residence",
            "numero_telephone",
            "whatsapp_actif",
            "est_wave",
            "date_naissance",
            "created_at",
        ]
        read_only_fields = ("created_at",)

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


# Alias pour la rétrocompatibilité des imports existants
RecolteurSerializer = PersonnelSerializer
