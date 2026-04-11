from django.db import models


class Recolteur(models.Model):
    # Recolteur: personne qui recolte
    code = models.CharField(max_length=20, unique=True)
    nom = models.CharField(max_length=120)
    lieu_residence = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.code:
            return f"{self.code} - {self.nom}"
        return self.nom
