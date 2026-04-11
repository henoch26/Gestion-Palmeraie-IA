from django.contrib import admin
from .models import Secteur


@admin.register(Secteur)
class SecteurAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "nom",
        "superficie_ha",
        "situation_relief",
        "type_sol",
        "created_at",
    )
    search_fields = ("code", "nom", "situation_relief", "type_sol")
