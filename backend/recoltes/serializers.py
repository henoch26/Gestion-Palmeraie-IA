from django.db import transaction
from rest_framework import serializers
from .models import (
    ActionLog,
    Client,
    FicheRecolte,
    SuperviseurAdjoint,
    FicheRecolteLigne,
    FicheRecolteDetail,
    FicheRecuVente,
    ParametreBonus,
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
    agent_code = serializers.CharField(source="agent.code", read_only=True, default=None)
    agent_telephone = serializers.CharField(source="agent.telephone", read_only=True, default=None)

    class Meta:
        model = SuperviseurAdjoint
        fields = ["id", "agent", "agent_code", "agent_telephone", "nom", "secteur_ou_recolteur", "matricule", "telephone"]


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
    prix_calcule       = serializers.SerializerMethodField()
    rapport_prix       = serializers.SerializerMethodField()
    client_nom         = serializers.CharField(source="client_obj.nom", read_only=True, default=None)
    fiche_date         = serializers.DateField(source="fiche.date", read_only=True)
    fiche_superviseur  = serializers.CharField(source="fiche.superviseur_general", read_only=True)
    fiche_superviseur_telephone = serializers.SerializerMethodField()
    statut_display     = serializers.CharField(source="get_statut_display", read_only=True)
    validated_by_display = serializers.SerializerMethodField()

    class Meta:
        model = FicheRecuVente
        fields = [
            "id", "statut", "statut_display", "validated_by_display", "validated_at",
            "fiche", "fiche_date", "fiche_superviseur", "fiche_superviseur_telephone",
            "date", "client", "client_obj", "client_nom",
            "pesee_kg", "non_conformes_pct", "montant",
            "prix_officiel", "prix_calcule", "rapport_prix",
            "reference_facture", "mode_paiement", "vehicule_transport",
        ]
        read_only_fields = [
            "prix_calcule", "rapport_prix", "fiche_date", "fiche_superviseur",
            "fiche_superviseur_telephone", "client_nom",
            "statut_display", "validated_by_display", "validated_at",
        ]

    def get_fiche_superviseur_telephone(self, obj):
        if obj.fiche and obj.fiche.superviseur_general_obj:
            return obj.fiche.superviseur_general_obj.telephone or ""
        # Fallback : chercher par le nom texte de la fiche
        nom = obj.fiche and (obj.fiche.superviseur_general or "").strip()
        if not nom:
            return ""
        from agents.models import SuperviseurGeneral as SupModel
        from django.db.models import Q, Value, CharField, F
        from django.db.models.functions import Concat
        sup = SupModel.objects.annotate(
            nc=Concat(F("nom"), Value(" "), F("prenom"), output_field=CharField()),
            nc_rev=Concat(F("prenom"), Value(" "), F("nom"), output_field=CharField()),
        ).filter(Q(nc__iexact=nom) | Q(nc_rev__iexact=nom) | Q(nom__iexact=nom)).first()
        return sup.telephone if sup and sup.telephone else ""

    def get_prix_calcule(self, obj):
        return obj.prix_calcule

    def get_rapport_prix(self, obj):
        return obj.rapport_prix

    def get_validated_by_display(self, obj):
        if not obj.validated_by:
            return None
        u = obj.validated_by
        return f"{u.first_name} {u.last_name}".strip() or u.username

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


class ParametreBonusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreBonus
        fields = [
            "id",
            "bareme_grands_defaut", "bareme_moyens_defaut", "bareme_petits_defaut",
            "seuil_non_conformes", "montant_bonus",
            "prix_kg_officiel",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class FicheRecolteSerializer(serializers.ModelSerializer):
    superviseurs_adjoints = SuperviseurAdjointSerializer(many=True, required=False)
    lignes = FicheRecolteLigneSerializer(many=True, required=False)
    recus = FicheRecuVenteSerializer(many=True, required=False)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    validated_by_display = serializers.SerializerMethodField()
    superviseur_general_display = serializers.SerializerMethodField()
    superviseur_general_telephone = serializers.SerializerMethodField()

    class Meta:
        model = FicheRecolte
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "depense_total", "validated_by", "validated_at"]

    def get_validated_by_display(self, obj):
        if not obj.validated_by:
            return None
        u = obj.validated_by
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_superviseur_general_display(self, obj):
        if obj.superviseur_general_obj:
            s = obj.superviseur_general_obj
            return f"{s.nom} {s.prenom}".strip()
        return obj.superviseur_general or None

    def get_superviseur_general_telephone(self, obj):
        if obj.superviseur_general_obj:
            return obj.superviseur_general_obj.telephone or ""
        # Fallback : chercher par nom (gère les deux ordres "NOM Prenom" et "Prenom NOM")
        nom = (obj.superviseur_general or "").strip()
        if not nom:
            return ""
        from agents.models import SuperviseurGeneral as SupModel
        from django.db.models import Q, Value, CharField, F
        from django.db.models.functions import Concat
        sup = SupModel.objects.annotate(
            nc=Concat(F("nom"), Value(" "), F("prenom"), output_field=CharField()),
            nc_rev=Concat(F("prenom"), Value(" "), F("nom"), output_field=CharField()),
        ).filter(Q(nc__iexact=nom) | Q(nc_rev__iexact=nom) | Q(nom__iexact=nom)).first()
        return sup.telephone if sup and sup.telephone else ""

    def validate(self, attrs):
        # Ces validations ne s'appliquent que si les champs sont présents dans la requête
        # (permet les PATCH partiels, ex: { statut: "valide" } sans re-soumettre toute la fiche)
        sup_obj = attrs.get("superviseur_general_obj")
        if "superviseur_general" in attrs and not sup_obj:
            if not (attrs.get("superviseur_general") or "").strip():
                raise serializers.ValidationError(
                    {"superviseur_general": "Superviseur general requis"}
                )
        # Auto-sync: si FK fournie, mettre à jour le champ texte
        if sup_obj:
            attrs["superviseur_general"] = f"{sup_obj.nom} {sup_obj.prenom}".strip()

        if "lignes" in attrs:
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


class FicheRecolteListSerializer(FicheRecolteSerializer):
    """Serializer allege pour l'action `list` de FicheRecolteViewSet.

    Omet lignes (qui imbrique details, 2 niveaux) et recus — les deux
    collections les plus couteuses a serialiser — ainsi que
    superviseurs_adjoints, superviseur_general_display et
    superviseur_general_telephone (ce dernier fait un fallback query par
    fiche quand superviseur_general_obj est vide). Expose a la place 4
    agregats legers (total_regimes, total_prix, nb_recolteurs, nb_recus)
    calcules en Python sur les objets deja prefetches, sans jamais
    instancier FicheRecolteLigneSerializer/FicheRecuVenteSerializer par
    ligne. Le detail complet reste disponible via GET /recoltes/:id/
    (FicheRecolteSerializer, action retrieve).
    """

    total_regimes = serializers.SerializerMethodField()
    total_prix = serializers.SerializerMethodField()
    nb_recolteurs = serializers.SerializerMethodField()
    nb_recus = serializers.SerializerMethodField()

    class Meta(FicheRecolteSerializer.Meta):
        fields = [
            "id", "date", "superviseur_general", "superviseur_general_obj",
            "bareme_grands", "bareme_moyens", "bareme_petits",
            "depense_nourriture", "depense_transport", "depense_salaire",
            "depense_total", "observations", "statut", "statut_display",
            "created_by", "created_by_username", "created_at",
            "validated_by", "validated_by_display", "validated_at",
            "total_regimes", "total_prix", "nb_recolteurs", "nb_recus",
        ]

    def get_total_regimes(self, obj):
        return sum(
            int(d.quantite or 0)
            for ligne in obj.lignes.all()
            for d in ligne.details.all()
        )

    def get_total_prix(self, obj):
        rates = {
            "grands": int(obj.bareme_grands or 0),
            "moyens": int(obj.bareme_moyens or 0),
            "petits": int(obj.bareme_petits or 0),
        }
        total = 0
        for ligne in obj.lignes.all():
            qty = sum(int(d.quantite or 0) for d in ligne.details.all())
            total += qty * int(rates.get(ligne.regime_type, 0) or 0)
        return total

    def get_nb_recolteurs(self, obj):
        noms = {(ligne.recolteur_nom or "Sans nom") for ligne in obj.lignes.all()}
        return len(noms)

    def get_nb_recus(self, obj):
        return len(obj.recus.all())


class ActionLogSerializer(serializers.ModelSerializer):
    acteur_display      = serializers.SerializerMethodField()
    superviseur_display = serializers.SerializerMethodField()
    action_display      = serializers.CharField(source="get_action_display", read_only=True)
    fiche_date          = serializers.DateField(source="fiche.date", read_only=True, default=None)
    detail_parsed       = serializers.SerializerMethodField()

    class Meta:
        model = ActionLog
        fields = [
            "id", "timestamp", "action", "action_display",
            "acteur_display", "superviseur_display",
            "fiche", "fiche_date", "recu",
            "detail", "detail_parsed", "annule",
        ]

    def get_acteur_display(self, obj):
        if not obj.acteur:
            return "—"
        u = obj.acteur
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_superviseur_display(self, obj):
        if not obj.superviseur:
            return "—"
        u = obj.superviseur
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_detail_parsed(self, obj):
        import json
        try:
            data = json.loads(obj.detail)
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, TypeError):
            pass
        return {"label": obj.detail or ""}
