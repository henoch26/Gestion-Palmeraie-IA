from rest_framework import serializers

from .models import Paiement


class PaiementSerializer(serializers.ModelSerializer):
    fiche_date = serializers.DateField(source="fiche.date", read_only=True)
    recolteur_display = serializers.SerializerMethodField()

    class Meta:
        model = Paiement
        fields = [
            "id",
            "fiche",
            "fiche_date",
            "recolteur",
            "recolteur_nom",
            "recolteur_display",
            "statut",
            "regimes_grands",
            "regimes_moyens",
            "regimes_petits",
            "total_regimes",
            "montant_fcfa",
            "is_obsolete",
            "paid_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = (
            "fiche",
            "fiche_date",
            "recolteur",
            "recolteur_nom",
            "recolteur_display",
            "regimes_grands",
            "regimes_moyens",
            "regimes_petits",
            "total_regimes",
            "montant_fcfa",
            "is_obsolete",
            "paid_at",
            "created_at",
            "updated_at",
        )

    def get_recolteur_display(self, obj):
        if obj.recolteur:
            return obj.recolteur.nom
        return obj.recolteur_nom or "Sans nom"


class PaiementUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paiement
        fields = ["statut"]

    def validate_statut(self, value):
        allowed = {Paiement.STATUT_EN_ATTENTE, Paiement.STATUT_PAYE, Paiement.STATUT_ANNULE}
        if value not in allowed:
            raise serializers.ValidationError("Statut invalide")
        return value

