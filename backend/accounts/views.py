from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.conf import settings as django_settings
from django.db import connections
from django.db.utils import OperationalError
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from utils.permissions import IsAdmin
from .models import Notification, UserProfile, AuditLog
from .serializers import CreateUserSerializer, ProfileSerializer, UpdateUserSerializer, UserListSerializer, AuditLogSerializer


def _user_payload(user):
    """Construit le payload utilisateur retourné au frontend."""
    try:
        profile = user.profile
        role = profile.role
        role_display = profile.get_role_display()
        must_change_password = profile.must_change_password
    except UserProfile.DoesNotExist:
        profile = UserProfile.objects.create(user=user, role=UserProfile.ROLE_ADMIN)
        role = profile.role
        role_display = profile.get_role_display()
        must_change_password = False
    try:
        numero_telephone = user.profile.numero_telephone
    except UserProfile.DoesNotExist:
        numero_telephone = ""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": role,
        "role_display": role_display,
        "must_change_password": must_change_password,
        "numero_telephone": numero_telephone,
    }


# ─── Auth ────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")
    user = authenticate(username=username, password=password)
    if not user:
        return Response({"detail": "Identifiants invalides"}, status=400)
    if not user.is_active:
        return Response({"detail": "Ce compte est désactivé"}, status=403)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": _user_payload(user)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response({"user": _user_payload(request.user)})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    if request.method == "GET":
        return Response({"user": _user_payload(request.user)})

    serializer = ProfileSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = request.user
    for attr in ("first_name", "last_name", "email"):
        if attr in data:
            setattr(user, attr, data[attr])
    user.save()

    if "numero_telephone" in data:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.numero_telephone = data["numero_telephone"]
        profile.save()

    return Response({"user": _user_payload(user)})


@api_view(["GET"])
@permission_classes([AllowAny])
def health_view(request):
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1;")
        return Response({"ok": True, "db": "ok"})
    except OperationalError as exc:
        return Response({"ok": False, "db": "error", "detail": str(exc)}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    current_password = request.data.get("current_password", "")
    new_password = request.data.get("new_password", "")

    if not current_password or not new_password:
        return Response({"detail": "Les deux champs sont requis."}, status=400)
    if len(new_password) < 6:
        return Response({"detail": "Le mot de passe doit contenir au moins 6 caractères."}, status=400)

    user = authenticate(username=request.user.username, password=current_password)
    if not user:
        return Response({"detail": "Mot de passe actuel incorrect."}, status=400)

    user.set_password(new_password)
    user.save()

    # Désactiver le flag must_change_password
    try:
        profile = user.profile
        profile.must_change_password = False
        profile.save()
    except UserProfile.DoesNotExist:
        pass

    # Renouveler le token pour invalider l'ancienne session
    Token.objects.filter(user=user).delete()
    new_token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": new_token.key, "user": _user_payload(user)})


# ─── Gestion des utilisateurs (admin only) ───────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def users_list_create(request):
    if request.method == "GET":
        users = User.objects.select_related("profile").all().order_by("username")
        return Response(UserListSerializer(users, many=True).data)

    serializer = CreateUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    plain_password = request.data.get("password", "")
    user = serializer.save()

    # Envoi email des identifiants si email renseigné
    if user.email and plain_password:
        try:
            send_mail(
                subject="Vos identifiants Palmeraie",
                message=(
                    f"Bonjour {user.first_name or user.username},\n\n"
                    f"Voici vos identifiants de connexion a l'application Palmeraie :\n"
                    f"Nom d'utilisateur : {user.username}\n"
                    f"Mot de passe temporaire : {plain_password}\n\n"
                    f"Vous devrez changer votre mot de passe des la premiere connexion.\n\n"
                    f"Cordialement,\nL'administrateur Palmeraie"
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass

    return Response(UserListSerializer(user).data, status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def users_detail(request, pk):
    try:
        user = User.objects.select_related("profile").get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Utilisateur introuvable"}, status=404)

    if request.method == "GET":
        return Response(UserListSerializer(user).data)

    if request.method == "PATCH":
        # Empêcher de se désactiver soi-même ou de retirer son propre rôle admin
        if user == request.user:
            if request.data.get("is_active") is False:
                return Response({"detail": "Impossible de désactiver votre propre compte"}, status=400)
            if request.data.get("role") == UserProfile.ROLE_SUPERVISEUR:
                return Response({"detail": "Impossible de rétrograder votre propre rôle"}, status=400)
        serializer = UpdateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(user, serializer.validated_data)
        user.refresh_from_db()
        return Response(UserListSerializer(user).data)

    if request.method == "DELETE":
        if user == request.user:
            return Response({"detail": "Impossible de supprimer votre propre compte"}, status=400)
        user.delete()
        return Response(status=204)


# ─── Notifications ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    notifs = Notification.objects.filter(user=request.user).order_by("-created_at")[:50]
    data = [
        {
            "id": n.id,
            "message": n.message,
            "type": n.type,
            "lu": n.lu,
            "lien": n.lien,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifs
    ]
    unread_count = Notification.objects.filter(user=request.user, lu=False).count()
    return Response({"results": data, "unread_count": unread_count})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, pk):
    try:
        notif = Notification.objects.get(pk=pk, user=request.user)
    except Notification.DoesNotExist:
        return Response({"detail": "Introuvable"}, status=404)
    notif.lu = True
    notif.save()
    return Response({"id": notif.id, "lu": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notifications_mark_all_read(request):
    Notification.objects.filter(user=request.user, lu=False).update(lu=True)
    return Response({"ok": True})


# ─── Journal d'audit (admin uniquement) ──────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def audit_log_list(request):
    table = request.query_params.get("table")
    record_id = request.query_params.get("id")
    qs = AuditLog.objects.select_related("utilisateur").order_by("-date_modification")
    if table:
        qs = qs.filter(table_concernee=table)
    if record_id:
        try:
            qs = qs.filter(id_enregistrement=int(record_id))
        except ValueError:
            pass
    data = AuditLogSerializer(qs[:200], many=True).data
    return Response({"results": data, "count": qs.count()})
