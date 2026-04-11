from django.contrib import admin
from .models import Recolteur


@admin.register(Recolteur)
class RecolteurAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "nom", "lieu_residence", "created_at")
    search_fields = ("code", "nom", "lieu_residence")
