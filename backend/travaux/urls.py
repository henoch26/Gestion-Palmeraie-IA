from rest_framework.routers import DefaultRouter

from .views import FicheTravauxViewSet

router = DefaultRouter()
router.register(r"travaux", FicheTravauxViewSet, basename="fiche-travaux")

urlpatterns = router.urls

