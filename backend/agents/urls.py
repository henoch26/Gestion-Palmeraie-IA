from rest_framework.routers import DefaultRouter
from .views import AgentTerrainViewSet

router = DefaultRouter()
router.register(r"agents", AgentTerrainViewSet, basename="agent")

urlpatterns = router.urls
