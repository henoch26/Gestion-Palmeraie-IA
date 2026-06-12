from django.urls import path
from .views import (
    login_view, me_view, health_view, change_password_view, profile_view,
    forgot_password_view, reset_password_view,
    users_list_create, users_detail,
    notifications_list, notification_mark_read, notifications_mark_all_read,
    audit_log_list, superviseurs_list, droits_list,
)

urlpatterns = [
    path("auth/login/", login_view),
    path("auth/me/", me_view),
    path("auth/change-password/", change_password_view),
    path("auth/profile/", profile_view),
    path("auth/forgot-password/", forgot_password_view),
    path("auth/reset-password/", reset_password_view),
    path("health/", health_view),
    # Gestion utilisateurs (admin uniquement)
    path("users/", users_list_create),
    path("users/<int:pk>/", users_detail),
    # Liste des superviseurs (tous les utilisateurs authentifiés)
    path("superviseurs/", superviseurs_list),
    # Notifications
    path("notifications/", notifications_list),
    path("notifications/<int:pk>/read/", notification_mark_read),
    path("notifications/mark-all-read/", notifications_mark_all_read),
    # Journal d'audit (admin uniquement)
    path("audit/", audit_log_list),
    # Droits fonctionnels (admin uniquement)
    path("droits/", droits_list),
]
