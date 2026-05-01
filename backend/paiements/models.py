from django.db import models
from django.db.models import Q


class Paiement(models.Model):
    STATUT_EN_ATTENTE = "en_attente"
    STATUT_PAYE = "paye"
    STATUT_ANNULE = "annule"

    STATUT_CHOICES = [
        (STATUT_EN_ATTENTE, "En attente"),
        (STATUT_PAYE, "Paye"),
        (STATUT_ANNULE, "Annule"),
    ]

    fiche = models.ForeignKey(
        "recoltes.FicheRecolte",
        on_delete=models.CASCADE,
        related_name="paiements",
    )
    recolteur = models.ForeignKey(
        "recolteurs.Recolteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paiements",
    )
    recolteur_nom = models.CharField(max_length=120, blank=True)

    statut = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default=STATUT_EN_ATTENTE,
    )

    regimes_grands = models.PositiveIntegerField(default=0)
    regimes_moyens = models.PositiveIntegerField(default=0)
    regimes_petits = models.PositiveIntegerField(default=0)
    total_regimes = models.PositiveIntegerField(default=0)
    montant_fcfa = models.PositiveIntegerField(default=0)

    is_obsolete = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["fiche", "recolteur"],
                name="uniq_paiement_fiche_recolteur",
            ),
            models.UniqueConstraint(
                fields=["fiche", "recolteur_nom"],
                condition=Q(recolteur__isnull=True),
                name="uniq_paiement_fiche_recolteur_nom_null",
            ),
        ]

    def __str__(self):
        who = self.recolteur.nom if self.recolteur else (self.recolteur_nom or "Sans nom")
        return f"Paiement {who} - {self.fiche.date} ({self.montant_fcfa} FCFA)"

