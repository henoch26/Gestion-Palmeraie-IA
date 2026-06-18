from decimal import Decimal

from django.conf import settings
from django.db import models


class FicheTravaux(models.Model):
    STATUT_CHOICES = [
        ("brouillon", "Brouillon"),
        ("soumis", "Soumis"),
        ("valide", "Validé"),
    ]

    STATUT_AVANCEMENT_CHOICES = [
        ("planifie", "Planifié"),
        ("en_cours", "En cours"),
        ("termine", "Terminé"),
    ]

    NATURE_CHOICES = [
        ("desherbage", "Désherbage"),
        ("traitement_phytosanitaire", "Traitement phytosanitaire"),
        ("fertilisation", "Fertilisation"),
        ("taille_ablation", "Taille / Ablation"),
        ("recolte", "Récolte"),
        ("pepiniere", "Pépinière"),
        ("plantation", "Plantation"),
        ("entretien_voie", "Entretien voie d'accès"),
        ("entretien_infrastructure", "Entretien infrastructure"),
        ("recensement", "Recensement"),
        ("autre", "Autre"),
    ]

    TYPE_TRAVAUX_CHOICES = [
        ("desherbage", "Désherbage"),
        ("traitement", "Traitement"),
        ("fertilisation", "Fertilisation"),
        ("taille", "Taille"),
        ("recolte", "Récolte"),
        ("pepiniere", "Pépinière"),
        ("plantation", "Plantation"),
        ("entretien_voie", "Entretien voie"),
        ("entretien_infra", "Entretien infrastructure"),
        ("recensement", "Recensement"),
        ("autre", "Autre"),
    ]

    # Auteur et statut de validation
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches_travaux",
    )
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="brouillon")
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="travaux_valides",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    # En-tete (fiche papier)
    superviseur_travaux = models.CharField(max_length=120, blank=True)
    nature_travaux = models.CharField(max_length=50, choices=NATURE_CHOICES, blank=True)
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
        db_table="fiche_travaux_secteur",
    )

    # Observations (fiche papier)
    observations = models.TextField(blank=True)

    # Nouveaux champs
    date_debut = models.DateField(null=True, blank=True)
    date_fin = models.DateField(null=True, blank=True)
    cout_total_calcule = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    salaire_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    statut_avancement = models.CharField(
        max_length=20, choices=STATUT_AVANCEMENT_CHOICES, default="planifie"
    )
    type_travaux = models.CharField(max_length=50, choices=TYPE_TRAVAUX_CHOICES, null=True, blank=True)

    # Matériels utilisés (via table intermédiaire dans materiels app)
    materiels_utilises = models.ManyToManyField(
        "materiels.MaterielEquipement",
        through="materiels.MaterielUtiliseTravaux",
        blank=True,
        related_name="fiches_travaux",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fiche_travaux"

    def __str__(self):
        base = self.nature_travaux or "Fiche travaux"
        if self.periode_travaux:
            return f"{base} - {self.periode_travaux}"
        return base

    def recalculer_cout(self):
        total = Decimal("0.00")
        for c in self.consommables.all():
            total += (c.quantite or Decimal("0.00")) * (c.prix_unitaire or Decimal("0.00"))
        for r in self.repartitions.all():
            total += (r.quantite or Decimal("0.00")) * (r.prix_unitaire or Decimal("0.00"))
        total += self.salaire_total or Decimal("0.00")
        FicheTravaux.objects.filter(pk=self.pk).update(cout_total_calcule=total)
        self.cout_total_calcule = total


class ConsommableTravaux(models.Model):
    fiche = models.ForeignKey(
        FicheTravaux, on_delete=models.CASCADE, related_name="consommables"
    )
    designation = models.CharField(max_length=200)
    quantite = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    unite = models.CharField(max_length=40, blank=True)
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Nouveaux champs
    fournisseur = models.CharField(max_length=120, null=True, blank=True)
    numero_lot = models.CharField(max_length=80, null=True, blank=True)
    date_peremption = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "consommable_travaux"

    def __str__(self):
        return self.designation


class RepartitionTache(models.Model):
    fiche = models.ForeignKey(
        FicheTravaux, on_delete=models.CASCADE, related_name="repartitions"
    )
    nom_prenom = models.CharField(max_length=120)
    nature_taches = models.CharField(max_length=200, blank=True)
    quantite = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    prix_unitaire = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Nouveaux champs
    salaire_total_calcule = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    matricule_ouvrier = models.CharField(max_length=40, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "repartition_tache"

    def __str__(self):
        return self.nom_prenom

    def save(self, *args, **kwargs):
        self.salaire_total_calcule = (self.quantite or Decimal("0.00")) * (self.prix_unitaire or Decimal("0.00"))
        super().save(*args, **kwargs)
