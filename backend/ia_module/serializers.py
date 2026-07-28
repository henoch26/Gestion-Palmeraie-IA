from rest_framework import serializers
from .models import ModeleIA, Prediction, Anomalie, DonneeMeteo, Prescription


class ModeleIASerializer(serializers.ModelSerializer):
    algorithme_display = serializers.CharField(source="get_algorithme_display", read_only=True)
    type_tache_display = serializers.CharField(source="get_type_tache_display", read_only=True)
    created_by_username = serializers.SerializerMethodField()
    usage_metier = serializers.SerializerMethodField()
    niveau_fiabilite = serializers.SerializerMethodField()

    class Meta:
        model = ModeleIA
        fields = [
            "id", "nom", "algorithme", "algorithme_display",
            "type_tache", "type_tache_display", "version",
            "metriques", "features", "nb_observations",
            "actif", "date_entrainement", "created_by_username",
            "usage_metier", "niveau_fiabilite",
        ]

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None

    def get_usage_metier(self, obj):
        if obj.type_tache == "regression":
            return "Prediction de rendement"
        if obj.type_tache == "classification":
            return "Detection d'anomalies"
        return "Surveillance automatique"

    def get_niveau_fiabilite(self, obj):
        score = obj.metriques.get("r2")
        if score is None:
            score = obj.metriques.get("f1") or obj.metriques.get("accuracy")
        if score is None:
            return {"label": "Non evaluee", "score": None}
        score = float(score)
        if score >= 0.85:
            label = "Tres fiable"
        elif score >= 0.70:
            label = "Fiable"
        elif score >= 0.50:
            label = "Indicative"
        else:
            label = "A renforcer"
        return {"label": label, "score": round(score * 100)}


class PredictionSerializer(serializers.ModelSerializer):
    modele_nom = serializers.SerializerMethodField()
    secteur_code = serializers.SerializerMethodField()
    recolteur_nom = serializers.SerializerMethodField()
    erreur_absolue = serializers.SerializerMethodField()
    lecture_metier = serializers.SerializerMethodField()

    class Meta:
        model = Prediction
        fields = [
            "id", "modele", "modele_nom", "secteur", "secteur_code",
            "recolteur", "recolteur_nom", "annee_cible", "mois_cible",
            "valeur_predite", "intervalle_bas", "intervalle_haut",
            "valeur_reelle", "erreur_absolue", "features_utilisees",
            "date_prediction", "lecture_metier",
        ]

    def get_modele_nom(self, obj):
        return obj.modele.nom if obj.modele else None

    def get_secteur_code(self, obj):
        return obj.secteur.code if obj.secteur else None

    def get_recolteur_nom(self, obj):
        return obj.recolteur.nom if obj.recolteur else None

    def get_erreur_absolue(self, obj):
        return obj.erreur_absolue

    def get_lecture_metier(self, obj):
        valeur = float(obj.valeur_predite or 0)
        bas = float(obj.intervalle_bas or 0)
        haut = float(obj.intervalle_haut or 0)
        if haut and bas and valeur and (haut - bas) > valeur * 0.5:
            return "Estimation utile mais incertaine : renforcer les donnees du secteur."
        return "Estimation exploitable pour la planification."


class AnomalieSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_anomalie_display", read_only=True)
    criticite_display = serializers.CharField(source="get_criticite_display", read_only=True)
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)
    methode_display = serializers.CharField(source="get_methode_detection_display", read_only=True)
    secteur_code = serializers.SerializerMethodField()
    recolteur_nom = serializers.SerializerMethodField()
    validated_by_username = serializers.SerializerMethodField()
    urgence_label = serializers.SerializerMethodField()
    recommandation = serializers.SerializerMethodField()
    methode_metier = serializers.SerializerMethodField()

    class Meta:
        model = Anomalie
        fields = [
            "id", "type_anomalie", "type_display", "criticite", "criticite_display",
            "statut", "statut_display", "description", "valeur_observee",
            "valeur_reference", "ecart_pct", "methode_detection", "methode_display",
            "score_anomalie", "secteur", "secteur_code", "recolteur", "recolteur_nom",
            "fiche_recolte", "validated_by", "validated_by_username",
            "validated_at", "details", "created_at", "urgence_label",
            "recommandation", "methode_metier",
        ]
        read_only_fields = ["created_at", "validated_at"]

    def get_secteur_code(self, obj):
        return obj.secteur.code if obj.secteur else None

    def get_recolteur_nom(self, obj):
        return obj.recolteur.nom if obj.recolteur else None

    def get_validated_by_username(self, obj):
        return obj.validated_by.username if obj.validated_by else None

    def get_urgence_label(self, obj):
        return {
            "faible": "A surveiller",
            "moyenne": "Important",
            "elevee": "Urgent",
            "critique": "Tres urgent",
        }.get(obj.criticite, "A traiter")

    def get_recommandation(self, obj):
        return {
            "recolte": "Verifier la fiche de recolte et confirmer les donnees du secteur.",
            "rendement": "Planifier un controle terrain pour expliquer le rendement faible.",
            "recolteur": "Echanger avec le recolteur et verifier les conditions de travail ou de saisie.",
            "poids": "Controler la pesee, le recu de vente et la qualite des regimes.",
        }.get(obj.type_anomalie, "Verifier les donnees et documenter la decision.")

    def get_methode_metier(self, obj):
        if obj.methode_detection == "regles_metier":
            return "Analyse par seuils metier"
        return "Analyse automatique avancee"


class DonneeMeteoSerializer(serializers.ModelSerializer):
    secteur_code = serializers.SerializerMethodField()

    class Meta:
        model = DonneeMeteo
        fields = [
            "id", "secteur", "secteur_code", "date",
            "temperature_max", "temperature_min", "temperature_moy",
            "precipitation_mm", "humidite_pct", "vitesse_vent_kmh",
            "description", "source", "created_at",
        ]

    def get_secteur_code(self, obj):
        return obj.secteur.code if obj.secteur else None


class PrescriptionSerializer(serializers.ModelSerializer):
    secteur_code = serializers.SerializerMethodField()
    secteur_nom = serializers.SerializerMethodField()
    created_by_username = serializers.SerializerMethodField()
    statut_display = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id", "secteur", "secteur_code", "secteur_nom",
            "annee_cible", "mois_cible", "objectif_regimes",
            "rendement_predit", "ecart_objectif_pct",
            "nb_recolteurs_recommande", "nb_heures_recommande",
            "frequence_cycle_jours", "nb_fiches_recommande",
            "facteur_saisonnier", "score_confiance", "productivite_moy",
            "conseils", "alertes", "details_calcul", "statut",
            "statut_display", "created_by", "created_by_username", "created_at",
        ]
        read_only_fields = ["created_by", "created_at"]

    def get_secteur_code(self, obj):
        return obj.secteur.code if obj.secteur else None

    def get_secteur_nom(self, obj):
        return obj.secteur.nom if obj.secteur else None

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None
