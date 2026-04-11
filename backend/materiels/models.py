from django.db import models


class MaterielEquipement(models.Model):
    # "Liste du materiel et des equipements" (fiche papier)
    numero = models.PositiveIntegerField(unique=True)
    designation = models.CharField(max_length=200, blank=True)
    quantite = models.PositiveIntegerField(default=0)
    etat_physique = models.CharField(max_length=120, blank=True)
    statut_utilisation = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        label = self.designation or "Materiel"
        return f"{self.numero} - {label}"

