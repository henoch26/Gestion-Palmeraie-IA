from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    entrainer_view,
    evaluation_modeles_view,
    predire_rendement_view,
    predire_plantation_view,
    detecter_anomalie_view,
    synthese_metier_view,
    simulation_view,
    prescriptions_view,
    risques_secteurs_view,
    plan_equipe_view,
    ModeleIAViewSet,
    PredictionViewSet,
    AnomalieViewSet,
    DonneeMeteoViewSet,
)

router = DefaultRouter()
router.register(r"ia/modeles", ModeleIAViewSet, basename="ia-modele")
router.register(r"ia/predictions", PredictionViewSet, basename="ia-prediction")
router.register(r"ia/anomalies", AnomalieViewSet, basename="ia-anomalie")
router.register(r"ia/meteo", DonneeMeteoViewSet, basename="ia-meteo")

urlpatterns = [
    path("ia/synthese/", synthese_metier_view, name="ia-synthese"),
    path("ia/simulation/", simulation_view, name="ia-simulation"),
    path("ia/prescriptions/", prescriptions_view, name="ia-prescriptions"),
    path("ia/risques-secteurs/", risques_secteurs_view, name="ia-risques-secteurs"),
    path("ia/plan-equipe/", plan_equipe_view, name="ia-plan-equipe"),
    path("ia/entrainer/", entrainer_view, name="ia-entrainer"),
    path("ia/evaluation-modeles/", evaluation_modeles_view, name="ia-evaluation-modeles"),
    path("ia/predire-rendement/", predire_rendement_view, name="ia-predire"),
    path("ia/predire-plantation/", predire_plantation_view, name="ia-predire-plantation"),
    path("ia/detecter-anomalie/", detecter_anomalie_view, name="ia-detecter"),
    path("", include(router.urls)),
]