from django.contrib import admin

from .models import (
    LotPepiniere,
    LotSemence,
    ObservationSanitaire,
    OperationPlantation,
    SuiviCroissance,
    SuiviPepiniere,
)


@admin.register(LotSemence)
class LotSemenceAdmin(admin.ModelAdmin):
    list_display = ("code_lot", "variete", "fournisseur", "date_acquisition", "nombre_graines", "taux_germination", "statut")
    search_fields = ("code_lot", "variete", "fournisseur", "origine")
    list_filter = ("statut", "date_acquisition")


@admin.register(LotPepiniere)
class LotPepiniereAdmin(admin.ModelAdmin):
    list_display = ("code_lot", "lot_semence", "date_entree", "nombre_plants_initial", "nombre_plants_valides", "taux_survie", "statut")
    search_fields = ("code_lot", "lot_semence__code_lot", "lot_semence__variete")
    list_filter = ("statut", "date_entree")


@admin.register(SuiviPepiniere)
class SuiviPepiniereAdmin(admin.ModelAdmin):
    list_display = ("lot_pepiniere", "date_observation", "nombre_plants_vivants", "taille_moyenne_cm", "etat_sanitaire")
    search_fields = ("lot_pepiniere__code_lot", "etat_sanitaire")
    list_filter = ("date_observation",)


@admin.register(OperationPlantation)
class OperationPlantationAdmin(admin.ModelAdmin):
    list_display = ("code_operation", "secteur", "lot_pepiniere", "date_plantation", "nombre_plants", "densite_plantation", "statut")
    search_fields = ("code_operation", "secteur__code", "secteur__nom", "lot_pepiniere__code_lot")
    list_filter = ("statut", "date_plantation")


@admin.register(SuiviCroissance)
class SuiviCroissanceAdmin(admin.ModelAdmin):
    list_display = ("secteur", "date_observation", "hauteur_moyenne_cm", "mortalite", "etat_general", "stress_hydrique")
    search_fields = ("secteur__code", "secteur__nom", "observations")
    list_filter = ("etat_general", "stress_hydrique", "date_observation")


@admin.register(ObservationSanitaire)
class ObservationSanitaireAdmin(admin.ModelAdmin):
    list_display = ("secteur", "date_observation", "type_probleme", "gravite", "statut")
    search_fields = ("secteur__code", "secteur__nom", "type_probleme")
    list_filter = ("gravite", "statut", "date_observation")