from rest_framework.permissions import BasePermission


def _get_role(user):
    try:
        return user.profile.role
    except AttributeError:
        return None


def has_droit(user, code):
    """Vérifie qu'un utilisateur possède un droit fonctionnel spécifique.
    L'admin a tous les droits implicitement."""
    if not user or not user.is_authenticated:
        return False
    if _get_role(user) == "admin":
        return True
    try:
        return user.profile.droits.filter(code=code).exists()
    except AttributeError:
        return False


class IsAdmin(BasePermission):
    """Seuls les administrateurs ont accès."""
    message = "Accès réservé aux administrateurs."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _get_role(request.user) == "admin"


class IsAdminOrReadOnly(BasePermission):
    """Lecture pour tous les authentifiés, écriture admin uniquement."""
    message = "Modification réservée aux administrateurs."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return _get_role(request.user) == "admin"


class IsSuperviseurOrAdjoint(BasePermission):
    """Superviseur ou superviseur adjoint (non-admin)."""
    message = "Accès réservé aux superviseurs."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        role = _get_role(request.user)
        return role in ("superviseur", "superviseur_adjoint")


class IsAdminOrSuperviseur(BasePermission):
    """Tout utilisateur authentifié avec un rôle valide."""
    message = "Accès réservé aux utilisateurs autorisés."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return _get_role(request.user) in ("admin", "superviseur", "superviseur_adjoint")
