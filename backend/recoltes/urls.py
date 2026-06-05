from rest_framework.routers import DefaultRouter
from .views import ClientViewSet, FicheRecolteViewSet

router = DefaultRouter()
router.register(r"recoltes", FicheRecolteViewSet, basename="fiche-recolte")
router.register(r"clients", ClientViewSet, basename="client")

urlpatterns = router.urls
