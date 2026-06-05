from django.db import models


class MaterielEquipement(models.Model):
    CATEGORIE_CHOICES = [
        ("vehicule", "Véhicule"),
        ("outil", "Outil"),
        ("equipement_lourd", "Équipement lourd"),
        ("petit_materiel", "Petit matériel"),
    ]

    # Champs existants
    numero = models.PositiveIntegerField(unique=True)
    designation = models.CharField(max_length=200, blank=True)
    quantite = models.PositiveIntegerField(default=0)
    etat_physique = models.CharField(max_length=120, blank=True)
    statut_utilisation = models.CharField(max_length=120, blank=True)

    # Nouveaux champs
    date_acquisition = models.DateField(null=True, blank=True)
    valeur_achat = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fournisseur = models.CharField(max_length=120, null=True, blank=True)
    date_derniere_maintenance = models.DateField(null=True, blank=True)
    date_prochaine_maintenance = models.DateField(null=True, blank=True)
    categorie = models.CharField(max_length=20, choices=CATEGORIE_CHOICES, null=True, blank=True)
    localisation = models.CharField(max_length=120, null=True, blank=True)
    responsable = models.CharField(max_length=120, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "materiel"

    def __str__(self):
        label = self.designation or "Materiel"
        return f"{self.numero} - {label}"


class MaterielUtiliseTravaux(models.Model):
    """Table intermédiaire explicite entre MaterielEquipement et FicheTravaux."""
    materiel = models.ForeignKey(
        MaterielEquipement,
        on_delete=models.CASCADE,
        related_name="utilisations_travaux",
    )
    fiche_travaux = models.ForeignKey(
        "travaux.FicheTravaux",
        on_delete=models.CASCADE,
        related_name="materiels_utilises_detail",
    )
    quantite_utilisee = models.PositiveIntegerField(default=1)
    observations = models.TextField(blank=True)

    class Meta:
        db_table = "materiel_travaux"
        unique_together = ("materiel", "fiche_travaux")
        verbose_name = "Matériel utilisé (travaux)"
        verbose_name_plural = "Matériels utilisés (travaux)"

    def __str__(self):
        return f"{self.materiel} × {self.quantite_utilisee}"
