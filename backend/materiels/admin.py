from django.contrib import admin

from .models import MaterielEquipement


@admin.register(MaterielEquipement)
class MaterielEquipementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "numero",
        "designation",
        "quantite",
        "etat_physique",
        "statut_utilisation",
        "created_at",
    )
    search_fields = ("designation", "etat_physique", "statut_utilisation")

