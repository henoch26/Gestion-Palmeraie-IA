from django.contrib import admin
from .models import Personnel


@admin.register(Personnel)
class PersonnelAdmin(admin.ModelAdmin):
    list_display = ("nom", "numero_telephone", "lieu_residence", "est_wave", "created_at")
    search_fields = ("numero_telephone", "nom", "lieu_residence")
    list_filter = ("est_wave",)
