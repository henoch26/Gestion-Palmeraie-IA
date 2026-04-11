from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from secteurs.models import Secteur
from .models import FicheTravaux, ConsommableTravaux, RepartitionTache


class ConsommableTravauxSerializer(serializers.ModelSerializer):
    prix_total = serializers.SerializerMethodField()

    class Meta:
        model = ConsommableTravaux
        fields = [
            "id",
            "designation",
            "quantite",
            "unite",
            "prix_unitaire",
            "prix_total",
        ]

    def get_prix_total(self, obj):
        q = obj.quantite or Decimal("0.00")
        p = obj.prix_unitaire or Decimal("0.00")
        return q * p


class RepartitionTacheSerializer(serializers.ModelSerializer):
    prix_total = serializers.SerializerMethodField()

    class Meta:
        model = RepartitionTache
        fields = [
            "id",
            "nom_prenom",
            "nature_taches",
            "quantite",
            "prix_unitaire",
            "prix_total",
        ]

    def get_prix_total(self, obj):
        q = obj.quantite or Decimal("0.00")
        p = obj.prix_unitaire or Decimal("0.00")
        return q * p


class FicheTravauxSerializer(serializers.ModelSerializer):
    secteurs_couverts = serializers.PrimaryKeyRelatedField(
        queryset=Secteur.objects.all(), many=True, required=False
    )
    secteurs_couverts_codes = serializers.SerializerMethodField()

    consommables = ConsommableTravauxSerializer(many=True, required=False)
    repartitions = RepartitionTacheSerializer(many=True, required=False)
    total_cout = serializers.SerializerMethodField()

    class Meta:
        model = FicheTravaux
        fields = "__all__"

    def get_secteurs_couverts_codes(self, obj):
        return list(obj.secteurs_couverts.all().values_list("code", flat=True))

    def get_total_cout(self, obj):
        total = Decimal("0.00")
        for c in obj.consommables.all():
            total += (c.quantite or Decimal("0.00")) * (c.prix_unitaire or Decimal("0.00"))
        for r in obj.repartitions.all():
            total += (r.quantite or Decimal("0.00")) * (r.prix_unitaire or Decimal("0.00"))
        return total

    @transaction.atomic
    def create(self, validated_data):
        secteurs = validated_data.pop("secteurs_couverts", [])
        consommables = validated_data.pop("consommables", [])
        repartitions = validated_data.pop("repartitions", [])

        fiche = FicheTravaux.objects.create(**validated_data)
        if secteurs:
            fiche.secteurs_couverts.set(secteurs)

        for c in consommables:
            ConsommableTravaux.objects.create(fiche=fiche, **c)

        for r in repartitions:
            RepartitionTache.objects.create(fiche=fiche, **r)

        return fiche

    @transaction.atomic
    def update(self, instance, validated_data):
        secteurs = validated_data.pop("secteurs_couverts", None)
        consommables = validated_data.pop("consommables", None)
        repartitions = validated_data.pop("repartitions", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if secteurs is not None:
            instance.secteurs_couverts.set(secteurs)

        if consommables is not None:
            instance.consommables.all().delete()
            for c in consommables:
                ConsommableTravaux.objects.create(fiche=instance, **c)

        if repartitions is not None:
            instance.repartitions.all().delete()
            for r in repartitions:
                RepartitionTache.objects.create(fiche=instance, **r)

        return instance

