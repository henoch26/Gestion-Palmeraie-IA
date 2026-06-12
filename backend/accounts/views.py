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
from utils.audit import log_action
from .models import Notification, PasswordResetToken, UserProfile, AuditLog, Droit
from .serializers import CreateUserSerializer, DroitSerializer, ProfileSerializer, UpdateUserSerializer, UserListSerializer, AuditLogSerializer


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
    try:
        permissions = list(user.profile.droits.values_list("code", flat=True))
    except Exception:
        permissions = []
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
        "permissions": permissions,
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


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_view(request):
    identifier = (request.data.get("email") or "").strip()
    if not identifier:
        return Response({"detail": "Identifiant ou email requis."}, status=400)

    user = None
    if "@" in identifier:
        user = User.objects.filter(email__iexact=identifier).first()
    if not user:
        user = User.objects.filter(username__iexact=identifier).first()

    if user and user.email:
        token_obj = PasswordResetToken.create_for_user(user)
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_url = f"{frontend_url}/reset-password?token={token_obj.token}"
        try:
            send_mail(
                subject="Réinitialisation de votre mot de passe Palmeraie",
                message=(
                    f"Bonjour {user.first_name or user.username},\n\n"
                    f"Vous avez demandé la réinitialisation de votre mot de passe.\n\n"
                    f"Cliquez sur ce lien pour définir un nouveau mot de passe (valable 1 heure) :\n"
                    f"{reset_url}\n\n"
                    f"Si vous n'avez pas fait cette demande, ignorez cet email.\n\n"
                    f"Cordialement,\nL'équipe Palmeraie"
                ),
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception:
            pass

    # Toujours 200 — ne pas révéler si le compte existe
    return Response({"detail": "Si un compte correspond, un email de réinitialisation a été envoyé."})


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password_view(request):
    token_value = (request.data.get("token") or "").strip()
    new_password = (request.data.get("password") or "").strip()

    if not token_value or not new_password:
        return Response({"detail": "Token et nouveau mot de passe requis."}, status=400)
    if len(new_password) < 6:
        return Response({"detail": "Le mot de passe doit contenir au moins 6 caractères."}, status=400)

    try:
        token_obj = PasswordResetToken.objects.select_related("user").get(token=token_value)
    except PasswordResetToken.DoesNotExist:
        return Response({"detail": "Lien invalide ou déjà utilisé."}, status=400)

    if not token_obj.is_valid():
        return Response({"detail": "Lien expiré. Faites une nouvelle demande."}, status=400)

    user = token_obj.user
    user.set_password(new_password)
    user.save()
    token_obj.used = True
    token_obj.save(update_fields=["used"])
    Token.objects.filter(user=user).delete()

    return Response({"detail": "Mot de passe réinitialisé. Vous pouvez vous connecter."})


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

    snap = {
        "Nom d'utilisateur": user.username,
        "Prénom": user.first_name or "",
        "Nom": user.last_name or "",
        "Email": user.email or "",
        "Rôle": getattr(getattr(user, "profile", None), "role", ""),
    }
    log_action(request.user, "creation_utilisateur",
               detail=f"Compte « {user.username} » créé.",
               meta={"snapshot": snap})
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

        # Champs personnels que l'admin ne peut pas modifier si l'utilisateur a pris possession de son compte
        PERSONAL_FIELDS = {"first_name", "last_name", "email", "numero_telephone"}
        user_profile = getattr(user, "profile", None)
        account_owned = user_profile and not user_profile.must_change_password

        # Réinitialisation de mot de passe : autorisée uniquement si must_change_password=True est explicitement envoyé
        is_password_reset = bool(request.data.get("password")) and request.data.get("must_change_password") is True

        if account_owned and not is_password_reset:
            blocked = PERSONAL_FIELDS & set(request.data.keys())
            # Bloquer aussi le changement de mot de passe seul (sans reset flag)
            if "password" in request.data:
                blocked.add("password")
            if blocked:
                return Response(
                    {"detail": f"Ce compte est géré par son titulaire. L'administrateur ne peut pas modifier : {', '.join(sorted(blocked))}."},
                    status=403,
                )

        # Mise à jour des permissions (si présentes dans la requête)
        if "permissions" in request.data:
            codes = request.data.get("permissions") or []
            profile, _ = UserProfile.objects.get_or_create(user=user)
            droits = Droit.objects.filter(code__in=codes)
            profile.droits.set(droits)

        serializer = UpdateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(user, serializer.validated_data)
        user.refresh_from_db()

        # Réinitialisation par l'admin : invalider le token pour forcer la reconnexion
        if is_password_reset:
            Token.objects.filter(user=user).delete()

        # ── Audit ──────────────────────────────────────────────────────
        _USER_LABELS = {
            "username":    "Nom d'utilisateur",
            "first_name":  "Prénom",
            "last_name":   "Nom",
            "email":       "Email",
            "role":        "Rôle",
            "is_active":   "Actif",
            "permissions": "Permissions",
        }
        changes = []
        for field, label in _USER_LABELS.items():
            if field in request.data:
                if field == "password":
                    continue  # ne pas loguer le mot de passe
                old_val = getattr(user, field, None)
                if field == "role":
                    old_val = getattr(getattr(user, "profile", None), "role", None)
                elif field == "is_active":
                    old_val = user.is_active
                elif field == "permissions":
                    old_val = sorted(user.profile.droits.values_list("code", flat=True)) if hasattr(user, "profile") else []
                new_val = request.data[field]
                if str(old_val or "") != str(new_val or ""):
                    changes.append({"field": label, "old": str(old_val or ""), "new": str(new_val or "")})
        if is_password_reset:
            changes.append({"field": "Mot de passe", "old": "***", "new": "réinitialisé par l'admin"})
        user.refresh_from_db()
        log_action(request.user, "modification_utilisateur",
                   detail=f"Compte « {user.username} » modifié.",
                   meta={"changes": changes})
        return Response(UserListSerializer(user).data)

    if request.method == "DELETE":
        if user == request.user:
            return Response({"detail": "Impossible de supprimer votre propre compte"}, status=400)
        snap = {
            "Nom d'utilisateur": user.username,
            "Prénom": user.first_name or "",
            "Nom": user.last_name or "",
            "Email": user.email or "",
            "Rôle": getattr(getattr(user, "profile", None), "role", ""),
        }
        log_action(request.user, "suppression_utilisateur",
                   detail=f"Compte « {user.username} » supprimé.",
                   meta={"snapshot": snap})
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


# ─── Droits disponibles (admin uniquement) ───────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def droits_list(request):
    droits = Droit.objects.all()
    return Response(DroitSerializer(droits, many=True).data)


# ─── Liste des superviseurs (tous les utilisateurs authentifiés) ─────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def superviseurs_list(request):
    users = User.objects.select_related("profile").filter(
        profile__role__in=(UserProfile.ROLE_SUPERVISEUR, UserProfile.ROLE_SUPERVISEUR_ADJOINT)
    ).filter(is_active=True).order_by("last_name", "first_name", "username")
    data = []
    for u in users:
        display = f"{u.first_name} {u.last_name}".strip() or u.username
        data.append({"id": u.id, "username": u.username, "display_name": display})
    return Response(data)


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
