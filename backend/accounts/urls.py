from django.urls import path
from .views import (
    login_view, me_view, health_view, change_password_view, profile_view,
    users_list_create, users_detail,
    notifications_list, notification_mark_read, notifications_mark_all_read,
    audit_log_list,
)

urlpatterns = [
    path("auth/login/", login_view),
    path("auth/me/", me_view),
    path("auth/change-password/", change_password_view),
    path("auth/profile/", profile_view),
    path("health/", health_view),
    # Gestion utilisateurs (admin uniquement)
    path("users/", users_list_create),
    path("users/<int:pk>/", users_detail),
    # Notifications
    path("notifications/", notifications_list),
    path("notifications/<int:pk>/read/", notification_mark_read),
    path("notifications/mark-all-read/", notifications_mark_all_read),
    # Journal d'audit (admin uniquement)
    path("audit/", audit_log_list),
]
