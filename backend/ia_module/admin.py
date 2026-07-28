from django.contrib import admin
from .models import ModeleIA, Prediction, Anomalie, DonneeMeteo


@admin.register(ModeleIA)
class ModeleIAAdmin(admin.ModelAdmin):
    list_display = ("nom", "algorithme", "type_tache", "version", "actif", "date_entrainement")
    list_filter  = ("algorithme", "type_tache", "actif")
    readonly_fields = ("date_entrainement",)


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = ("modele", "secteur", "annee_cible", "mois_cible", "valeur_predite", "date_prediction")
    list_filter  = ("annee_cible", "mois_cible")


@admin.register(Anomalie)
class AnomalieAdmin(admin.ModelAdmin):
    list_display = ("type_anomalie", "criticite", "statut", "methode_detection", "created_at")
    list_filter  = ("statut", "criticite", "type_anomalie", "methode_detection")


@admin.register(DonneeMeteo)
class DonneeMeteoAdmin(admin.ModelAdmin):
    list_display = ("date", "secteur", "temperature_moy", "precipitation_mm", "humidite_pct")
    list_filter  = ("secteur",)
    date_hierarchy = "date"
