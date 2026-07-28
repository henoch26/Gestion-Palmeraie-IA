"""
ia_module/models.py — Modèles pour le module Intelligence Artificielle.

Tables :
  ModeleIA    — Métadonnées des modèles ML entraînés et sauvegardés (Joblib)
  Prediction  — Résultats de prédiction de rendement par secteur/période
  Anomalie    — Anomalies détectées (règles métier + algorithmes ML)
  DonneeMeteo — Données météorologiques quotidiennes par secteur
"""
import os
from django.conf import settings
from django.db import models


def modele_upload_path(instance, filename):
    return os.path.join("ia_models", filename)


class ModeleIA(models.Model):
    ALGORITHME_CHOICES = [
        ("linear_regression",    "Régression Linéaire"),
        ("random_forest",        "Random Forest Regressor"),
        ("decision_tree",        "Arbre de Décision"),
        ("logistic_regression",  "Régression Logistique"),
        ("isolation_forest",     "Isolation Forest"),
    ]
    TYPE_TACHE_CHOICES = [
        ("regression",      "Régression (prédiction rendement)"),
        ("classification",  "Classification (anomalie supervisée)"),
        ("anomalie",        "Détection d'anomalies (non supervisée)"),
    ]
    nom = models.CharField(max_length=120)
    algorithme = models.CharField(max_length=40, choices=ALGORITHME_CHOICES)
    type_tache = models.CharField(max_length=20, choices=TYPE_TACHE_CHOICES)
    version = models.PositiveIntegerField(default=1)
    chemin_fichier = models.FileField(upload_to=modele_upload_path, blank=True)
    metriques = models.JSONField(default=dict)
    features = models.JSONField(default=list)
    nb_observations = models.PositiveIntegerField(default=0)
    actif = models.BooleanField(default=True)
    date_entrainement = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="modeles_ia",
    )
    class Meta:
        db_table = "modele_ia"
        ordering = ["-date_entrainement"]
    def __str__(self):
        return f"{self.nom} v{self.version} ({self.get_algorithme_display()})"


class Prediction(models.Model):
    modele = models.ForeignKey(
        ModeleIA, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="predictions",
    )
    secteur = models.ForeignKey(
        "secteurs.Secteur", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="predictions_ia",
    )
    recolteur = models.ForeignKey(
        "recolteurs.Personnel", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="predictions_ia",
    )
    annee_cible = models.PositiveIntegerField()
    mois_cible = models.PositiveSmallIntegerField(null=True, blank=True)
    valeur_predite = models.DecimalField(max_digits=12, decimal_places=2)
    intervalle_bas = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    intervalle_haut = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    valeur_reelle = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    features_utilisees = models.JSONField(default=dict)
    date_prediction = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="predictions_ia",
    )

    class Meta:
        db_table = "prediction_ia"
        ordering = ["-date_prediction"]

    def __str__(self):
        periode = f"{self.annee_cible}/{self.mois_cible:02d}" if self.mois_cible else str(self.annee_cible)
        return f"Prédiction {periode} → {self.valeur_predite}"

    @property
    def erreur_absolue(self):
        if self.valeur_reelle is not None:
            return abs(float(self.valeur_predite) - float(self.valeur_reelle))
        return None


class Anomalie(models.Model):
    TYPE_CHOICES = [
        ("recolte",   "Anomalie récolte"),
        ("rendement", "Anomalie rendement"),
        ("recolteur", "Anomalie récolteur"),
        ("poids",     "Anomalie poids/régimes"),
    ]
    CRITICITE_CHOICES = [
        ("faible",    "Faible"),
        ("moyenne",   "Moyenne"),
        ("elevee",    "Élevée"),
        ("critique",  "Critique"),
    ]
    STATUT_CHOICES = [
        ("nouvelle",  "Nouvelle"),
        ("validee",   "Validée"),
        ("rejetee",   "Rejetée"),
    ]
    METHODE_CHOICES = [
        ("regles_metier",       "Règles métier"),
        ("isolation_forest",    "Isolation Forest"),
        ("decision_tree",       "Arbre de décision"),
        ("logistic_regression", "Régression logistique"),
        ("residu_prediction",   "Résidu du modèle de prédiction"),
    ]

    type_anomalie = models.CharField(max_length=20, choices=TYPE_CHOICES)
    criticite = models.CharField(max_length=10, choices=CRITICITE_CHOICES, default="moyenne")
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default="nouvelle")
    description = models.TextField()
    valeur_observee = models.DecimalField(max_digits=14, decimal_places=2)
    valeur_reference = models.DecimalField(max_digits=14, decimal_places=2)
    ecart_pct = models.DecimalField(max_digits=8, decimal_places=2)
    methode_detection = models.CharField(max_length=30, choices=METHODE_CHOICES, default="regles_metier")
    score_anomalie = models.FloatField(null=True, blank=True)
    secteur = models.ForeignKey(
        "secteurs.Secteur", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="anomalies_ia",
    )
    recolteur = models.ForeignKey(
        "recolteurs.Personnel", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="anomalies_ia",
    )
    fiche_recolte = models.ForeignKey(
        "recoltes.FicheRecolte", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="anomalies_ia",
    )
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="anomalies_validees",
    )
    validated_at = models.DateTimeField(null=True, blank=True)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "anomalie_ia"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_type_anomalie_display()} — {self.criticite} ({self.statut})"


class Prescription(models.Model):
    """
    Prescription IA : conseils et recommandations opérationnelles
    pour atteindre un objectif de rendement sur un secteur.
    """
    STATUT_CHOICES = [
        ("nouvelle",  "Nouvelle"),
        ("appliquee", "Appliquée"),
        ("ignoree",   "Ignorée"),
    ]

    secteur = models.ForeignKey(
        "secteurs.Secteur", on_delete=models.CASCADE,
        related_name="prescriptions_ia",
    )
    annee_cible = models.PositiveIntegerField()
    mois_cible  = models.PositiveSmallIntegerField()

    # Objectif et prédiction de base
    objectif_regimes = models.DecimalField(max_digits=12, decimal_places=2)
    rendement_predit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    ecart_objectif_pct = models.FloatField(default=0)

    # Recommandations opérationnelles
    nb_recolteurs_recommande  = models.PositiveSmallIntegerField(default=0)
    nb_heures_recommande      = models.DecimalField(max_digits=5, decimal_places=1, default=7)
    frequence_cycle_jours     = models.PositiveSmallIntegerField(default=15)
    nb_fiches_recommande      = models.PositiveSmallIntegerField(default=2)

    # Contexte calculé
    facteur_saisonnier  = models.FloatField(default=1.0)
    score_confiance     = models.FloatField(default=0)
    productivite_moy    = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Contenu prescriptif (listes de dicts)
    conseils = models.JSONField(default=list)
    alertes  = models.JSONField(default=list)
    details_calcul = models.JSONField(default=dict)

    statut = models.CharField(max_length=12, choices=STATUT_CHOICES, default="nouvelle")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="prescriptions_ia",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "prescription_ia"
        ordering = ["-created_at"]

    def __str__(self):
        mois_str = f"{self.mois_cible:02d}" if self.mois_cible else "—"
        return f"Prescription {self.secteur.code} {mois_str}/{self.annee_cible}"


class DonneeMeteo(models.Model):
    secteur = models.ForeignKey(
        "secteurs.Secteur", on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="donnees_meteo",
    )
    date = models.DateField()
    temperature_max = models.FloatField(null=True, blank=True)
    temperature_min = models.FloatField(null=True, blank=True)
    temperature_moy = models.FloatField(null=True, blank=True)
    precipitation_mm = models.FloatField(null=True, blank=True)
    humidite_pct = models.FloatField(null=True, blank=True)
    vitesse_vent_kmh = models.FloatField(null=True, blank=True)
    description = models.CharField(max_length=200, blank=True)
    source = models.CharField(max_length=100, blank=True, default="open-meteo")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "donnee_meteo"
        ordering = ["-date"]
        unique_together = ("date", "secteur")

    def __str__(self):
        secteur_str = self.secteur.code if self.secteur else "global"
        return f"Meteo {self.date} — {secteur_str}"
