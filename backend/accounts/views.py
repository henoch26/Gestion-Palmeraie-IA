from django.db import connections
from django.db.utils import OperationalError
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    # Connexion simple: username + password
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if not user:
        return Response({"detail": "Identifiants invalides"}, status=400)

    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            "token": token.key,
            "user": {"id": user.id, "username": user.username},
        }
    )


@api_view(["GET"])
def me_view(request):
    # Retourne l'utilisateur connecte
    user = request.user
    return Response({"id": user.id, "username": user.username})


@api_view(["GET"])
@permission_classes([AllowAny])
def health_view(request):
    # Healthcheck simple: verifie l'acces a la base de donnees
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1;")
        return Response({"ok": True, "db": "ok"})
    except OperationalError as exc:
        # On renvoie le message pour faciliter le debug en dev
        return Response(
            {"ok": False, "db": "error", "detail": str(exc)},
            status=500,
        )
