from .models import Notification


def create_notification(user, message, type="info", lien=""):
    """Crée une notification pour un utilisateur donné."""
    if user is None:
        return
    Notification.objects.create(user=user, message=message, type=type, lien=lien)
