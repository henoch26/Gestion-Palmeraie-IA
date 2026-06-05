from rest_framework.routers import DefaultRouter
from .views import MaterielEquipementViewSet, MaterielUtiliseTravauxViewSet

router = DefaultRouter()
router.register(r"materiels", MaterielEquipementViewSet, basename="materiel")
router.register(r"materiels-utilises", MaterielUtiliseTravauxViewSet, basename="materiel-utilise")

urlpatterns = router.urls
