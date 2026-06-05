from django.db import models


class Personnel(models.Model):
    """Ancien modèle Recolteur, renommé Personnel (techniciens/récolteurs saisonniers)."""

    OPERATEUR_CHOICES = [
        ("orange_money", "Orange Money"),
        ("mtn_momo", "MTN MoMo"),
        ("moov_money", "Moov Money"),
        ("autre", "Autre"),
    ]

    CONTRAT_CHOICES = [
        ("journalier", "Journalier"),
        ("permanent", "Permanent"),
    ]

    # Identifiant lisible auto-généré (PER-001, PER-002, …)
    code = models.CharField(max_length=20, unique=True, blank=True)
    nom = models.CharField(max_length=120)
    lieu_residence = models.CharField(max_length=120)

    # Téléphone principal (anciennement numero_telephone — conservé pour rétro-compat.)
    numero_telephone = models.CharField(max_length=20, unique=True, blank=True)
    # Téléphone secondaire / professionnel
    telephone = models.CharField(max_length=20, null=True, blank=True)

    # WhatsApp
    numero_whatsapp = models.CharField(max_length=20, blank=True)
    whatsapp_actif = models.BooleanField(default=False)

    # Mobile Money
    est_wave = models.BooleanField(default=False)
    est_mobile_money = models.BooleanField(default=False)
    operateur_mm = models.CharField(
        max_length=20, choices=OPERATEUR_CHOICES, blank=True
    )

    # Nouveaux champs
    date_naissance = models.DateField(null=True, blank=True)
    photo = models.ImageField(upload_to="personnel/photos/", null=True, blank=True)
    contrat = models.CharField(max_length=20, choices=CONTRAT_CHOICES, null=True, blank=True)
    date_embauche = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "personnel"
        verbose_name = "Personnel"
        verbose_name_plural = "Personnel"

    def __str__(self):
        tel = self.numero_telephone or "—"
        return f"{self.nom} ({tel})"

    # Propriété de compatibilité ascendante
    @property
    def recolteur_nom(self):
        return self.nom

    def _generate_code(self) -> str:
        last = Personnel.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        return f"PER-{next_id:03d}"

    def save(self, *args, **kwargs):
        if not (self.code or "").strip():
            # Génération provisoire avant l'insert pour éviter un aller-retour
            self.code = self._generate_code()
        super().save(*args, **kwargs)
        # Après sauvegarde, on peut avoir l'id réel — on corrige si besoin
        expected = f"PER-{self.id:03d}"
        if self.code != expected:
            Personnel.objects.filter(pk=self.pk).update(code=expected)
            self.code = expected


# Alias de rétrocompatibilité pour les imports existants
Recolteur = Personnel
