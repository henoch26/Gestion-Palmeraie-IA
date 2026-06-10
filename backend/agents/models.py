from django.conf import settings
from django.db import models


class SuperviseurGeneral(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="superviseur_profile",
    )
    code = models.CharField(max_length=20, unique=True, blank=True)
    nom = models.CharField(max_length=120)
    prenom = models.CharField(max_length=120, blank=True)
    matricule = models.CharField(max_length=40, blank=True)
    telephone = models.CharField(max_length=20, blank=True)
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "superviseur_general"
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.nom} {self.prenom}".strip() or self.code

    def _generate_code(self):
        last = SuperviseurGeneral.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        return f"SUP-{next_id:03d}"

    def save(self, *args, **kwargs):
        if not (self.code or "").strip():
            self.code = self._generate_code()
        super().save(*args, **kwargs)
        expected = f"SUP-{self.id:03d}"
        if self.code != expected:
            SuperviseurGeneral.objects.filter(pk=self.pk).update(code=expected)
            self.code = expected


class AgentTerrain(models.Model):
    nom = models.CharField(max_length=120)
    prenom = models.CharField(max_length=120, blank=True)
    matricule = models.CharField(max_length=40, blank=True)
    telephone = models.CharField(max_length=20, blank=True)
    secteur = models.ForeignKey(
        "secteurs.Secteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agents_terrain",
    )
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "agent_terrain"
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.nom} {self.prenom}".strip() or f"Agent #{self.pk}"
