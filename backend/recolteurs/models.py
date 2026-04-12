from django.db import models


class Recolteur(models.Model):
    # Recolteur: personne qui recolte
    # Code auto-genere (REC-000001). Ce champ n'est pas a saisir manuellement.
    code = models.CharField(max_length=20, unique=True, blank=True, null=True, editable=False)
    nom = models.CharField(max_length=120)
    lieu_residence = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        # Une fois l'ID connu, on fixe le code si absent.
        # On utilise une mise a jour directe pour eviter de rappeler save() en boucle.
        if not (self.code or "").strip() and self.pk:
            # Format court: REC-001, REC-012, REC-120, REC-1000...
            self.code = f"REC-{self.pk:03d}"
            Recolteur.objects.filter(pk=self.pk).update(code=self.code)

    def __str__(self):
        if self.code:
            return f"{self.code} - {self.nom}"
        return self.nom
