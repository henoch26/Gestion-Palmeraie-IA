from django.urls import path

from .views import summary_view

urlpatterns = [
    path("dashboard/summary/", summary_view),
]

