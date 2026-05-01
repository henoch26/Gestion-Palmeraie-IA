from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AnomalieViewSet,
    FacteurProductionViewSet,
    ParametreIAViewSet,
    PredictionScenarioViewSet,
    ia_advanced_view,
    ia_summary_view,
)

router = DefaultRouter()
router.register(r"ia/facteurs-production", FacteurProductionViewSet, basename="ia-facteurs-production")
router.register(r"ia/params", ParametreIAViewSet, basename="ia-param")
router.register(r"ia/predictions", PredictionScenarioViewSet, basename="ia-predictions")
router.register(r"ia/anomalies", AnomalieViewSet, basename="ia-anomalies")

urlpatterns = [
    path("ia/summary/", ia_summary_view),
    path("ia/advanced/", ia_advanced_view),
]

urlpatterns += router.urls
