"""
Signals accounts :
  - AuditLog : enregistre toute modification faite par un admin sur une fiche validée
  - Alertes quotidiennes : déclenchées par la commande management check_alerts
"""
from django.db.models.signals import pre_save
from django.dispatch import receiver

from recoltes.models import FicheRecolte
from travaux.models import FicheTravaux
from .models import AuditLog


def _get_admin_user(sender_instance):
    """Retourne le request.user stocké temporairement sur l'instance (si défini)."""
    return getattr(sender_instance, "_audit_user", None)


def _record_changes(instance, old_instance, table_name, user):
    if old_instance is None or user is None:
        return
    fields_to_watch = [f.name for f in instance._meta.get_fields() if hasattr(f, "column")]
    for field_name in fields_to_watch:
        try:
            old_val = getattr(old_instance, field_name, None)
            new_val = getattr(instance, field_name, None)
        except Exception:
            continue
        if str(old_val) != str(new_val):
            AuditLog.objects.create(
                utilisateur=user,
                table_concernee=table_name,
                id_enregistrement=instance.pk,
                champ_modifie=field_name,
                ancienne_valeur=str(old_val) if old_val is not None else "",
                nouvelle_valeur=str(new_val) if new_val is not None else "",
                motif=getattr(instance, "_audit_motif", ""),
            )


@receiver(pre_save, sender=FicheRecolte)
def audit_fiche_recolte(sender, instance, **kwargs):
    if not instance.pk:
        return
    user = _get_admin_user(instance)
    if not user:
        return
    try:
        old = FicheRecolte.objects.get(pk=instance.pk)
    except FicheRecolte.DoesNotExist:
        return
    if old.statut == "valide":
        _record_changes(instance, old, "FicheRecolte", user)


@receiver(pre_save, sender=FicheTravaux)
def audit_fiche_travaux(sender, instance, **kwargs):
    if not instance.pk:
        return
    user = _get_admin_user(instance)
    if not user:
        return
    try:
        old = FicheTravaux.objects.get(pk=instance.pk)
    except FicheTravaux.DoesNotExist:
        return
    if old.statut == "valide":
        _record_changes(instance, old, "FicheTravaux", user)
