from rest_framework.routers import DefaultRouter
from .views import AgentTerrainViewSet, SuperviseurGeneralViewSet

router = DefaultRouter()
router.register(r"agents", AgentTerrainViewSet, basename="agent")
router.register(r"superviseurs-generaux", SuperviseurGeneralViewSet, basename="superviseur-general")

urlpatterns = router.urls
