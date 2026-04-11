from rest_framework import serializers
from .models import Secteur


class SecteurSerializer(serializers.ModelSerializer):
    superficie_ha = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=True, allow_null=False
    )
    production_total = serializers.IntegerField(read_only=True)
    last_recolte = serializers.DateField(read_only=True, allow_null=True)
    rendement_ha = serializers.SerializerMethodField()

    class Meta:
        model = Secteur
        fields = "__all__"

    def get_rendement_ha(self, obj):
        # Rendement simple: regimes / ha (sur toute la production disponible dans le queryset annote)
        superficie = getattr(obj, "superficie_ha", None)
        prod = getattr(obj, "production_total", None)
        try:
            superficie_val = float(superficie) if superficie is not None else 0.0
            prod_val = float(prod) if prod is not None else 0.0
        except Exception:
            return 0

        if superficie_val <= 0:
            return 0
        return round(prod_val / superficie_val, 4)
