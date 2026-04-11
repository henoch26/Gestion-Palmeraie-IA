from rest_framework.routers import DefaultRouter

from .views import MaterielEquipementViewSet

router = DefaultRouter()
router.register(r"materiels", MaterielEquipementViewSet, basename="materiel")

urlpatterns = router.urls

