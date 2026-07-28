from django.urls import path

from .views_avancees import (
    assistant_metier_view,
    scoring_recolteurs_view,
    tendances_view,
)


urlpatterns = [
    path("ia/tendances/", tendances_view, name="ia-tendances"),
    path("ia/assistant-metier/", assistant_metier_view, name="ia-assistant-metier"),
    path("ia/scoring-recolteurs/", scoring_recolteurs_view, name="ia-scoring-recolteurs"),
]