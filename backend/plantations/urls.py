from rest_framework.routers import DefaultRouter

from .views import (
    ContexteAgronomiqueViewSet,
    LotPepiniereViewSet,
    LotSemenceViewSet,
    ObservationSanitaireViewSet,
    OperationPlantationViewSet,
    SuiviCroissanceViewSet,
    SuiviPepiniereViewSet,
)

router = DefaultRouter()
router.register(r"contextes-agronomiques", ContexteAgronomiqueViewSet, basename="contexte-agronomique")
router.register(r"semences", LotSemenceViewSet, basename="lot-semence")
router.register(r"pepinieres", LotPepiniereViewSet, basename="lot-pepiniere")
router.register(r"suivis-pepiniere", SuiviPepiniereViewSet, basename="suivi-pepiniere")
router.register(r"plantations", OperationPlantationViewSet, basename="operation-plantation")
router.register(r"suivis-croissance", SuiviCroissanceViewSet, basename="suivi-croissance")
router.register(r"observations-sanitaires", ObservationSanitaireViewSet, basename="observation-sanitaire")

urlpatterns = router.urls