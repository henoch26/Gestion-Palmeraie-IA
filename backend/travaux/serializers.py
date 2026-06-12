import re
from datetime import date
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
            "id", "designation", "quantite", "unite", "prix_unitaire", "prix_total",
            "fournisseur", "numero_lot", "date_peremption",
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
            "id", "nom_prenom", "nature_taches", "quantite", "prix_unitaire",
            "prix_total", "salaire_total_calcule", "matricule_ouvrier",
        ]

    def get_prix_total(self, obj):
        q = obj.quantite or Decimal("0.00")
        p = obj.prix_unitaire or Decimal("0.00")
        return q * p


class FicheTravauxSerializer(serializers.ModelSerializer):
    PERIODE_RE = re.compile(r"^\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s*$")

    secteurs_couverts = serializers.PrimaryKeyRelatedField(
        queryset=Secteur.objects.all(), many=True, required=False
    )
    secteurs_couverts_codes = serializers.SerializerMethodField()

    consommables = ConsommableTravauxSerializer(many=True, required=False)
    repartitions = RepartitionTacheSerializer(many=True, required=False)
    total_cout = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    validated_by_display = serializers.SerializerMethodField()
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    statut_avancement_display = serializers.CharField(source="get_statut_avancement_display", read_only=True)
    nature_travaux_display = serializers.CharField(source="get_nature_travaux_display", read_only=True)
    type_travaux_display = serializers.SerializerMethodField()
    superviseur_travaux_telephone = serializers.SerializerMethodField()

    CHAMPS_ADMIN = {"total_cout", "cout_total_calcule"}

    class Meta:
        model = FicheTravaux
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "cout_total_calcule"]
        extra_kwargs = {
            "superviseur_travaux": {"required": True, "allow_blank": False},
            "nature_travaux": {"required": True, "allow_blank": False},
            "periode_travaux": {"required": True, "allow_blank": False},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request.user, "profile") and request.user.profile.is_superviseur:
            for champ in self.CHAMPS_ADMIN:
                data.pop(champ, None)
        return data

    def get_validated_by_display(self, obj):
        if obj.validated_by:
            name = f"{obj.validated_by.first_name} {obj.validated_by.last_name}".strip()
            return name or obj.validated_by.username
        return None

    def get_secteurs_couverts_codes(self, obj):
        return list(obj.secteurs_couverts.all().values_list("code", flat=True))

    def get_total_cout(self, obj):
        total = Decimal("0.00")
        for c in obj.consommables.all():
            total += (c.quantite or Decimal("0.00")) * (c.prix_unitaire or Decimal("0.00"))
        for r in obj.repartitions.all():
            total += (r.quantite or Decimal("0.00")) * (r.prix_unitaire or Decimal("0.00"))
        return total

    def get_type_travaux_display(self, obj):
        if obj.type_travaux:
            return dict(FicheTravaux.TYPE_TRAVAUX_CHOICES).get(obj.type_travaux, obj.type_travaux)
        return None

    def get_superviseur_travaux_telephone(self, obj):
        if not obj.superviseur_travaux:
            return ""
        from agents.models import SuperviseurGeneral
        sup = SuperviseurGeneral.objects.filter(nom__iexact=obj.superviseur_travaux).first()
        return sup.telephone if sup and sup.telephone else ""

    def validate(self, attrs):
        if self.instance is None or "superviseur_travaux" in attrs:
            superviseur = str(attrs.get("superviseur_travaux") or "").strip()
            if not superviseur:
                raise serializers.ValidationError({"superviseur_travaux": "Superviseur des travaux requis"})
            attrs["superviseur_travaux"] = superviseur

        if self.instance is None or "nature_travaux" in attrs:
            nature = str(attrs.get("nature_travaux") or "").strip()
            if not nature:
                raise serializers.ValidationError({"nature_travaux": "Nature des travaux requise"})
            attrs["nature_travaux"] = nature

        if self.instance is None or "periode_travaux" in attrs:
            periode = str(attrs.get("periode_travaux") or "").strip()
            if not periode:
                raise serializers.ValidationError({"periode_travaux": "Periode requise"})
            m = self.PERIODE_RE.match(periode)
            if not m:
                raise serializers.ValidationError({"periode_travaux": "Format attendu: AAAA-MM-JJ - AAAA-MM-JJ"})
            start_s, end_s = m.groups()
            try:
                start = date.fromisoformat(start_s)
                end = date.fromisoformat(end_s)
            except ValueError as exc:
                raise serializers.ValidationError({"periode_travaux": f"Dates invalides: {exc}"}) from exc
            if start > end:
                raise serializers.ValidationError({"periode_travaux": "La date fin doit etre >= date debut"})
            attrs["periode_travaux"] = f"{start.isoformat()} - {end.isoformat()}"
            if "date_debut" not in attrs or attrs.get("date_debut") is None:
                attrs["date_debut"] = start
            if "date_fin" not in attrs or attrs.get("date_fin") is None:
                attrs["date_fin"] = end

        secteurs = attrs.get("secteurs_couverts", None)
        if self.instance is None:
            if not secteurs:
                raise serializers.ValidationError({"secteurs_couverts": "Selectionne au moins un secteur"})
        else:
            if secteurs is not None and len(secteurs) == 0:
                raise serializers.ValidationError({"secteurs_couverts": "Selectionne au moins un secteur"})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        secteurs = validated_data.pop("secteurs_couverts", [])
        consommables = validated_data.pop("consommables", [])
        repartitions = validated_data.pop("repartitions", [])
        validated_data.pop("materiels_utilises", None)

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
        validated_data.pop("materiels_utilises", None)

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
