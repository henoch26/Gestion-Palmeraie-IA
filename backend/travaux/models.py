from decimal import Decimal

from django.db import models


class FicheTravaux(models.Model):
    # En-tete (fiche papier)
    superviseur_travaux = models.CharField(max_length=120, blank=True)
    nature_travaux = models.CharField(max_length=255, blank=True)
    superficie_couverte_ha = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    periode_travaux = models.CharField(max_length=120, blank=True)
    nb_personnes = models.PositiveIntegerField(null=True, blank=True)

    # Liste des secteurs couverts
    secteurs_couverts = models.ManyToManyField(
        "secteurs.Secteur",
        blank=True,
        related_name="fiches_travaux",
    )

    # Observations (fiche papier)
    observations = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        base = self.nature_travaux or "Fiche travaux"
        if self.periode_travaux:
            return f"{base} - {self.periode_travaux}"
        return base


class ConsommableTravaux(models.Model):
    # Consommables necessaires (designation + quantite + prix)
    fiche = models.ForeignKey(
        FicheTravaux, on_delete=models.CASCADE, related_name="consommables"
    )
    designation = models.CharField(max_length=200)
    quantite = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    unite = models.CharField(max_length=40, blank=True)
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.designation


class RepartitionTache(models.Model):
    # Repartition des taches executees par personne
    fiche = models.ForeignKey(
        FicheTravaux, on_delete=models.CASCADE, related_name="repartitions"
    )
    nom_prenom = models.CharField(max_length=120)
    nature_taches = models.CharField(max_length=200, blank=True)
    quantite = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nom_prenom

