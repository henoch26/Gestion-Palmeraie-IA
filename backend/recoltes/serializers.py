from django.db import transaction
from rest_framework import serializers
from .models import (
    Client,
    FicheRecolte,
    SuperviseurAdjoint,
    FicheRecolteLigne,
    FicheRecolteDetail,
    FicheRecuVente,
)


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "nom", "telephone", "adresse", "created_at"]
        read_only_fields = ["created_at"]

    def validate_nom(self, value):
        value = " ".join(value.split()).strip()
        if not value:
            raise serializers.ValidationError("Le nom est requis.")
        qs = Client.objects.filter(nom__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ce client existe déjà.")
        return value


class SuperviseurAdjointSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuperviseurAdjoint
        fields = ["id", "nom", "secteur_ou_recolteur", "matricule", "telephone"]


class FicheRecolteDetailSerializer(serializers.ModelSerializer):
    secteur_code = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = FicheRecolteDetail
        fields = ["id", "secteur", "secteur_code", "quantite", "coordonnees_GPS_palmier", "qualite_regime"]


class FicheRecolteLigneSerializer(serializers.ModelSerializer):
    details = FicheRecolteDetailSerializer(many=True)
    recolteur_nom_display = serializers.CharField(source="recolteur.nom", read_only=True)
    total_regimes = serializers.SerializerMethodField()
    prix_fcfa = serializers.SerializerMethodField()

    class Meta:
        model = FicheRecolteLigne
        fields = [
            "id",
            "recolteur",
            "recolteur_nom",
            "recolteur_nom_display",
            "regime_type",
            "total_regimes",
            "prix_fcfa",
            "salaire_calcule",
            "prime_qualite",
            "nb_heures_travail",
            "details",
        ]

    def get_total_regimes(self, obj):
        return sum(int(d.quantite or 0) for d in obj.details.all())

    def get_prix_fcfa(self, obj):
        total = self.get_total_regimes(obj)
        fiche = getattr(obj, "fiche", None)
        if not fiche:
            return 0
        rates = {
            "grands": int(getattr(fiche, "bareme_grands", 0) or 0),
            "moyens": int(getattr(fiche, "bareme_moyens", 0) or 0),
            "petits": int(getattr(fiche, "bareme_petits", 0) or 0),
        }
        return int(total) * int(rates.get(obj.regime_type, 0) or 0)

    def validate(self, attrs):
        if not attrs.get("recolteur") and not attrs.get("recolteur_nom"):
            raise serializers.ValidationError("recolteur ou recolteur_nom requis")
        return attrs


class FicheRecuVenteSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        d = attrs.get("date")
        client = (attrs.get("client") or "").strip()
        pesee = attrs.get("pesee_kg") or 0
        non_conf = attrs.get("non_conformes_pct") or 0
        montant = attrs.get("montant") or 0

        is_empty = (
            (not d)
            and (not client)
            and float(pesee or 0) == 0.0
            and float(non_conf or 0) == 0.0
            and float(montant or 0) == 0.0
        )
        if is_empty:
            return attrs

        if not d:
            raise serializers.ValidationError({"date": "Date requise"})
        if float(montant or 0) <= 0.0:
            raise serializers.ValidationError({"montant": "Montant requis"})
        return attrs

    class Meta:
        model = FicheRecuVente
        fields = [
            "id", "date", "client", "pesee_kg", "non_conformes_pct", "montant",
            "reference_facture", "mode_paiement", "vehicule_transport",
        ]


class FicheRecolteSerializer(serializers.ModelSerializer):
    superviseurs_adjoints = SuperviseurAdjointSerializer(many=True, required=False)
    lignes = FicheRecolteLigneSerializer(many=True, required=False)
    recus = FicheRecuVenteSerializer(many=True, required=False)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)

    # Champs financiers — masqués pour les non-admin
    CHAMPS_ADMIN = {
        "bareme_grands", "bareme_moyens", "bareme_petits",
        "depense_nourriture", "depense_transport", "depense_salaire",
        "depense_total", "recus",
    }

    class Meta:
        model = FicheRecolte
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "depense_total"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and hasattr(request.user, "profile") and request.user.profile.is_superviseur:
            for champ in self.CHAMPS_ADMIN:
                data.pop(champ, None)
        return data

    def validate(self, attrs):
        if not (attrs.get("superviseur_general") or "").strip():
            raise serializers.ValidationError(
                {"superviseur_general": "Superviseur general requis"}
            )

        lignes = attrs.get("lignes") or []
        if not lignes:
            raise serializers.ValidationError(
                {"lignes": "Au moins une recolte (quantite > 0) est requise"}
            )

        has_any_qty = False
        for ligne in lignes:
            for det in (ligne.get("details") or []):
                try:
                    if int(det.get("quantite") or 0) > 0:
                        has_any_qty = True
                        break
                except Exception:
                    pass
            if has_any_qty:
                break

        if not has_any_qty:
            raise serializers.ValidationError({"lignes": "Saisis au moins une quantite > 0"})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        superviseurs_data = validated_data.pop("superviseurs_adjoints", [])
        lignes_data = validated_data.pop("lignes", [])
        recus_data = validated_data.pop("recus", [])

        fiche = FicheRecolte.objects.create(**validated_data)

        for sup in superviseurs_data:
            SuperviseurAdjoint.objects.create(fiche=fiche, **sup)

        for ligne in lignes_data:
            details = ligne.pop("details", [])
            details = [d for d in details if int(d.get("quantite") or 0) > 0]
            if not details:
                continue
            recolteur = ligne.get("recolteur")
            if recolteur and not ligne.get("recolteur_nom"):
                ligne["recolteur_nom"] = recolteur.nom
            line = FicheRecolteLigne.objects.create(fiche=fiche, **ligne)
            for det in details:
                secteur = det.get("secteur")
                if secteur and not det.get("secteur_code"):
                    det["secteur_code"] = secteur.code
                FicheRecolteDetail.objects.create(ligne=line, **det)

        for recu in recus_data:
            d = recu.get("date")
            client = (recu.get("client") or "").strip()
            pesee = recu.get("pesee_kg") or 0
            non_conf = recu.get("non_conformes_pct") or 0
            montant = recu.get("montant") or 0
            is_empty = (
                (not d) and (not client)
                and float(pesee or 0) == 0.0
                and float(non_conf or 0) == 0.0
                and float(montant or 0) == 0.0
            )
            if not is_empty:
                FicheRecuVente.objects.create(fiche=fiche, **recu)

        return fiche

    @transaction.atomic
    def update(self, instance, validated_data):
        superviseurs_data = validated_data.pop("superviseurs_adjoints", None)
        lignes_data = validated_data.pop("lignes", None)
        recus_data = validated_data.pop("recus", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if superviseurs_data is not None:
            instance.superviseurs_adjoints.all().delete()
            for sup in superviseurs_data:
                SuperviseurAdjoint.objects.create(fiche=instance, **sup)

        if lignes_data is not None:
            instance.lignes.all().delete()
            for ligne in lignes_data:
                details = ligne.pop("details", [])
                details = [d for d in details if int(d.get("quantite") or 0) > 0]
                if not details:
                    continue
                recolteur = ligne.get("recolteur")
                if recolteur and not ligne.get("recolteur_nom"):
                    ligne["recolteur_nom"] = recolteur.nom
                line = FicheRecolteLigne.objects.create(fiche=instance, **ligne)
                for det in details:
                    secteur = det.get("secteur")
                    if secteur and not det.get("secteur_code"):
                        det["secteur_code"] = secteur.code
                    FicheRecolteDetail.objects.create(ligne=line, **det)

        if recus_data is not None:
            instance.recus.all().delete()
            for recu in recus_data:
                d = recu.get("date")
                client = (recu.get("client") or "").strip()
                pesee = recu.get("pesee_kg") or 0
                non_conf = recu.get("non_conformes_pct") or 0
                montant = recu.get("montant") or 0
                is_empty = (
                    (not d) and (not client)
                    and float(pesee or 0) == 0.0
                    and float(non_conf or 0) == 0.0
                    and float(montant or 0) == 0.0
                )
                if not is_empty:
                    FicheRecuVente.objects.create(fiche=instance, **recu)

        return instance
