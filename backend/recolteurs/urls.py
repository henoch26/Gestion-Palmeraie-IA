from rest_framework.routers import DefaultRouter
from .views import PersonnelViewSet

router = DefaultRouter()
# URL principale : /api/personnel/
router.register(r"personnel", PersonnelViewSet, basename="personnel")

urlpatterns = router.urls
