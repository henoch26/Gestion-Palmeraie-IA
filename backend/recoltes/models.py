from django.conf import settings
from django.db import models


class Client(models.Model):
    """Acheteur des régimes de palme (lié aux reçus de vente)."""
    nom = models.CharField(max_length=120, unique=True)
    telephone = models.CharField(max_length=20, blank=True)
    adresse = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "client"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class FicheRecolte(models.Model):
    STATUT_CHOICES = [
        ("brouillon", "Brouillon"),
        ("soumis", "Soumis"),
        ("valide", "Validé"),
    ]

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches_recolte",
    )
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="brouillon")
    date = models.DateField()
    superviseur_general = models.CharField(max_length=120, blank=True)
    bareme_grands = models.PositiveIntegerField(default=60)
    bareme_moyens = models.PositiveIntegerField(default=50)
    bareme_petits = models.PositiveIntegerField(default=25)
    depense_nourriture = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    depense_transport = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    depense_salaire = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    observations = models.TextField(blank=True)
    heure_debut = models.TimeField(null=True, blank=True)
    heure_fin = models.TimeField(null=True, blank=True)
    conditions_meteo = models.CharField(max_length=120, null=True, blank=True)
    nb_palmiers_recoltes = models.PositiveIntegerField(null=True, blank=True)
    surface_recoltee_ha = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # Dépense totale = nourriture + transport + salaires versés aux récolteurs (auto)
    depense_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    # Traçabilité de la validation
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches_validees",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "fiche_recolte"

    def __str__(self):
        return f"Fiche {self.date}"


class SuperviseurAdjoint(models.Model):
    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="superviseurs_adjoints"
    )
    agent = models.ForeignKey(
        "agents.AgentTerrain",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches_participees",
    )
    nom = models.CharField(max_length=120)
    secteur_ou_recolteur = models.CharField(max_length=120)
    matricule = models.CharField(max_length=40, null=True, blank=True)
    telephone = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        db_table = "superviseur_adjoint"

    def __str__(self):
        return self.nom


class FicheRecolteLigne(models.Model):
    REGIME_CHOICES = [
        ("grands", "Grands"),
        ("moyens", "Moyens"),
        ("petits", "Petits"),
    ]

    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="lignes"
    )
    recolteur = models.ForeignKey(
        "recolteurs.Personnel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lignes_recolte",
    )
    recolteur_nom = models.CharField(max_length=120, blank=True)
    regime_type = models.CharField(max_length=10, choices=REGIME_CHOICES)
    salaire_calcule = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    prime_qualite = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    nb_heures_travail = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "ligne_recolte"

    def __str__(self):
        return f"{self.recolteur_nom or self.recolteur} - {self.regime_type}"


class FicheRecolteDetail(models.Model):
    QUALITE_CHOICES = [
        ("A", "A"),
        ("B", "B"),
        ("C", "C"),
    ]

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
    coordonnees_GPS_palmier = models.CharField(max_length=100, null=True, blank=True)
    qualite_regime = models.CharField(max_length=2, choices=QUALITE_CHOICES, null=True, blank=True)

    class Meta:
        db_table = "detail_recolte"
        unique_together = ("ligne", "secteur")

    def __str__(self):
        return f"{self.secteur_code} - {self.quantite}"


class FicheRecuVente(models.Model):
    MODE_PAIEMENT_CHOICES = [
        ("espece", "Espèce"),
        ("virement", "Virement"),
    ]

    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="recus"
    )
    date = models.DateField(null=True, blank=True)
    client = models.CharField(max_length=120, blank=True)
    pesee_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    non_conformes_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_facture = models.CharField(max_length=80, null=True, blank=True)
    mode_paiement = models.CharField(max_length=20, choices=MODE_PAIEMENT_CHOICES, null=True, blank=True)
    vehicule_transport = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "recu_vente"

    def __str__(self):
        return f"Recu {self.date} - {self.client}"
