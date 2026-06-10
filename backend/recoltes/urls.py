from rest_framework.routers import DefaultRouter
from .views import ActionLogViewSet, ClientViewSet, FicheRecolteViewSet, FicheRecuVenteViewSet, ParametreBonusViewSet

router = DefaultRouter()
router.register(r"recoltes", FicheRecolteViewSet, basename="fiche-recolte")
router.register(r"clients", ClientViewSet, basename="client")
router.register(r"recus-vente", FicheRecuVenteViewSet, basename="recu-vente")
router.register(r"parametre-bonus", ParametreBonusViewSet, basename="parametre-bonus")
router.register(r"action-logs", ActionLogViewSet, basename="action-log")

urlpatterns = router.urls
