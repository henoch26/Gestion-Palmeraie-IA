from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import ConsommableTravaux, RepartitionTache


def _recalculer_cout_fiche(fiche):
    """Recalcule cout_total_calcule de la FicheTravaux."""
    try:
        fiche.recalculer_cout()
    except Exception:
        pass


@receiver(post_save, sender=ConsommableTravaux)
def on_consommable_saved(sender, instance, **kwargs):
    _recalculer_cout_fiche(instance.fiche)


@receiver(post_delete, sender=ConsommableTravaux)
def on_consommable_deleted(sender, instance, **kwargs):
    _recalculer_cout_fiche(instance.fiche)


@receiver(post_save, sender=RepartitionTache)
def on_repartition_saved(sender, instance, **kwargs):
    _recalculer_cout_fiche(instance.fiche)


@receiver(post_delete, sender=RepartitionTache)
def on_repartition_deleted(sender, instance, **kwargs):
    _recalculer_cout_fiche(instance.fiche)
