from django.db import models


class FicheRecolte(models.Model):
    # En-tete de la fiche
    date = models.DateField()
    superviseur_general = models.CharField(max_length=120, blank=True)

    # Bareme editable (Grands / Moyens / Petits)
    bareme_grands = models.PositiveIntegerField(default=60)
    bareme_moyens = models.PositiveIntegerField(default=50)
    bareme_petits = models.PositiveIntegerField(default=25)

    # Depenses
    depense_nourriture = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    depense_transport = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Observations
    observations = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Fiche {self.date}"


class SuperviseurAdjoint(models.Model):
    # Liste des superviseurs adjoints
    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="superviseurs_adjoints"
    )
    nom = models.CharField(max_length=120)
    secteur_ou_recolteur = models.CharField(max_length=120)

    def __str__(self):
        return self.nom


class FicheRecolteLigne(models.Model):
    # Ligne par recolteur + type de regime
    REGIME_CHOICES = [
        ("grands", "Grands"),
        ("moyens", "Moyens"),
        ("petits", "Petits"),
    ]

    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="lignes"
    )
    recolteur = models.ForeignKey(
        "recolteurs.Recolteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lignes_recolte",
    )
    recolteur_nom = models.CharField(max_length=120, blank=True)
    regime_type = models.CharField(max_length=10, choices=REGIME_CHOICES)

    def __str__(self):
        return f"{self.recolteur_nom or self.recolteur} - {self.regime_type}"


class FicheRecolteDetail(models.Model):
    # Quantite par secteur pour une ligne (recolteur + regime)
    ligne = models.ForeignKey(
        FicheRecolteLigne, on_delete=models.CASCADE, related_name="details"
    )
    secteur = models.ForeignKey(
        "secteurs.Secteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="details_recolte",
    )
    secteur_code = models.CharField(max_length=20, blank=True)
    quantite = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("ligne", "secteur")

    def __str__(self):
        return f"{self.secteur_code} - {self.quantite}"


class FicheRecuVente(models.Model):
    # Recu de vente lie a la fiche
    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="recus"
    )
    date = models.DateField(null=True, blank=True)
    client = models.CharField(max_length=120, blank=True)
    pesee_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    non_conformes_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"Recu {self.date} - {self.client}"
