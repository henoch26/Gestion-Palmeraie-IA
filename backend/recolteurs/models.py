from django.db import models


class Personnel(models.Model):
    nom = models.CharField(max_length=120)
    lieu_residence = models.CharField(max_length=120)
    numero_telephone = models.CharField(max_length=20, unique=True, blank=True)
    whatsapp_actif = models.BooleanField(default=False)
    est_wave = models.BooleanField(default=False)
    date_naissance = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "personnel"
        verbose_name = "Personnel"
        verbose_name_plural = "Personnel"

    def __str__(self):
        return f"{self.nom} ({self.numero_telephone or '—'})"

    @property
    def recolteur_nom(self):
        return self.nom


# Alias de rétrocompatibilité pour les imports existants
Recolteur = Personnel
