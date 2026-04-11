from django.contrib import admin

from .models import FicheTravaux, ConsommableTravaux, RepartitionTache


@admin.register(FicheTravaux)
class FicheTravauxAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "superviseur_travaux",
        "nature_travaux",
        "superficie_couverte_ha",
        "periode_travaux",
        "nb_personnes",
        "created_at",
    )
    search_fields = ("superviseur_travaux", "nature_travaux", "periode_travaux")


@admin.register(ConsommableTravaux)
class ConsommableTravauxAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "designation", "quantite", "unite", "prix_unitaire", "created_at")
    search_fields = ("designation", "unite")


@admin.register(RepartitionTache)
class RepartitionTacheAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "nom_prenom", "nature_taches", "quantite", "prix_unitaire", "created_at")
    search_fields = ("nom_prenom", "nature_taches")

