from django.db import models


class Secteur(models.Model):
    # Code interne (ex: GP_1), visible dans la fiche
    code = models.CharField(max_length=20, unique=True)
    nom = models.CharField(max_length=120)
    superficie_ha = models.DecimalField(max_digits=8, decimal_places=2)
    situation_relief = models.CharField(max_length=120, blank=True)
    type_sol = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.code} - {self.nom}"
