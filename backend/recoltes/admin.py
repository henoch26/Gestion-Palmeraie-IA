from django.contrib import admin
from .models import (
    FicheRecolte,
    SuperviseurAdjoint,
    FicheRecolteLigne,
    FicheRecolteDetail,
    FicheRecuVente,
)


@admin.register(FicheRecolte)
class FicheRecolteAdmin(admin.ModelAdmin):
    list_display = ("id", "date", "superviseur_general", "created_at")
    search_fields = ("superviseur_general",)


@admin.register(SuperviseurAdjoint)
class SuperviseurAdjointAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "nom", "secteur_ou_recolteur")
    search_fields = ("nom", "secteur_ou_recolteur")


@admin.register(FicheRecolteLigne)
class FicheRecolteLigneAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "recolteur_nom", "regime_type")
    list_filter = ("regime_type",)


@admin.register(FicheRecolteDetail)
class FicheRecolteDetailAdmin(admin.ModelAdmin):
    list_display = ("id", "ligne", "secteur_code", "quantite")


@admin.register(FicheRecuVente)
class FicheRecuVenteAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "date", "client", "montant")
