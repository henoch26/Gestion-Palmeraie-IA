from django.contrib import admin

from .models import Paiement


@admin.register(Paiement)
class PaiementAdmin(admin.ModelAdmin):
    list_display = ("id", "fiche", "recolteur", "recolteur_nom", "statut", "montant_fcfa", "paid_at", "is_obsolete")
    list_filter = ("statut", "is_obsolete")
    search_fields = ("recolteur__nom", "recolteur_nom", "fiche__id")

