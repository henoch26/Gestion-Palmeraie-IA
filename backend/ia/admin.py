from django.contrib import admin

from .models import Anomalie, FacteurProduction, ParametreIA, PredictionScenario


@admin.register(FacteurProduction)
class FacteurProductionAdmin(admin.ModelAdmin):
    list_display = ("secteur", "year", "month", "pluviometrie_mm", "temperature_moyenne", "maladie_detectee", "incident_signale")
    list_filter = ("year", "month", "maladie_detectee", "incident_signale", "accessibilite_secteur")
    search_fields = ("secteur__code", "secteur__nom", "type_incident", "observations")


@admin.register(ParametreIA)
class ParametreIAAdmin(admin.ModelAdmin):
    list_display = ("key", "updated_at")
    search_fields = ("key", "description")


@admin.register(PredictionScenario)
class PredictionScenarioAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "year", "secteur", "algorithm", "horizon_months")
    list_filter = ("year", "algorithm")


@admin.register(Anomalie)
class AnomalieAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "year", "type", "niveau", "secteur", "recolteur", "resolved")
    list_filter = ("year", "type", "niveau", "resolved")
    search_fields = ("message", "type", "metric")
