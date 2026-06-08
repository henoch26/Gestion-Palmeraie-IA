from django.conf import settings
from django.db import models


class Notification(models.Model):
    TYPE_CHOICES = [
        ("success", "Succes"),
        ("warning", "Avertissement"),
        ("info", "Information"),
    ]
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    message = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="info")
    lu = models.BooleanField(default=False)
    lien = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notification"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username} — {self.message[:50]}"


class Droit(models.Model):
    """Permission fonctionnelle attribuable à un superviseur par l'admin."""
    code = models.CharField(max_length=60, unique=True)
    label = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "droit"
        ordering = ["ordre", "label"]

    def __str__(self):
        return self.label


class UserProfile(models.Model):
    ROLE_ADMIN = "admin"
    ROLE_SUPERVISEUR = "superviseur"
    ROLE_SUPERVISEUR_ADJOINT = "superviseur_adjoint"
    ROLE_CHOICES = [
        (ROLE_ADMIN, "Administrateur"),
        (ROLE_SUPERVISEUR, "Superviseur"),
        (ROLE_SUPERVISEUR_ADJOINT, "Superviseur adjoint"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default=ROLE_SUPERVISEUR)
    must_change_password = models.BooleanField(default=False)
    numero_telephone = models.CharField(max_length=20, blank=True, default="")
    droits = models.ManyToManyField(Droit, blank=True, related_name="profils")

    class Meta:
        db_table = "profil_utilisateur"

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    @property
    def is_admin(self):
        return self.role == self.ROLE_ADMIN

    @property
    def is_superviseur(self):
        # True pour superviseur ET superviseur_adjoint (tous deux non-admin)
        return self.role in (self.ROLE_SUPERVISEUR, self.ROLE_SUPERVISEUR_ADJOINT)

    @property
    def is_superviseur_strict(self):
        return self.role == self.ROLE_SUPERVISEUR

    @property
    def is_superviseur_adjoint(self):
        return self.role == self.ROLE_SUPERVISEUR_ADJOINT


class AuditLog(models.Model):
    """Journal d'audit des modifications sur les fiches validées."""
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    table_concernee = models.CharField(max_length=100)
    id_enregistrement = models.IntegerField(null=True, blank=True)
    champ_modifie = models.CharField(max_length=100)
    ancienne_valeur = models.TextField(blank=True)
    nouvelle_valeur = models.TextField(blank=True)
    date_modification = models.DateTimeField(auto_now_add=True)
    motif = models.TextField(blank=True)

    class Meta:
        db_table = "audit_log"
        ordering = ["-date_modification"]
        verbose_name = "Journal d'audit"
        verbose_name_plural = "Journal d'audit"

    def __str__(self):
        return f"{self.table_concernee}#{self.id_enregistrement} — {self.champ_modifie}"
