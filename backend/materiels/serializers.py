from rest_framework import serializers

from .models import MaterielEquipement, MaterielUtiliseTravaux


class MaterielEquipementSerializer(serializers.ModelSerializer):
    categorie_display = serializers.CharField(source="get_categorie_display", read_only=True)

    class Meta:
        model = MaterielEquipement
        fields = "__all__"


class MaterielUtiliseTravauxSerializer(serializers.ModelSerializer):
    materiel_designation = serializers.CharField(source="materiel.designation", read_only=True)
    materiel_numero = serializers.IntegerField(source="materiel.numero", read_only=True)

    class Meta:
        model = MaterielUtiliseTravaux
        fields = [
            "id", "materiel", "materiel_designation", "materiel_numero",
            "fiche_travaux", "quantite_utilisee", "observations",
        ]
