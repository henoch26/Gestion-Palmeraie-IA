from django.contrib import admin
from .models import Personnel


@admin.register(Personnel)
class PersonnelAdmin(admin.ModelAdmin):
    list_display = ("code", "nom", "numero_telephone", "lieu_residence", "contrat",
                    "est_wave", "est_mobile_money", "created_at")
    search_fields = ("code", "numero_telephone", "nom", "lieu_residence")
    list_filter = ("contrat", "est_mobile_money", "est_wave")
