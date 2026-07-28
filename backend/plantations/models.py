from django.conf import settings
from django.db import models
from django.utils.text import slugify


class LotSemence(models.Model):
    STATUT_CHOICES = [
        ("acquis", "Acquis"),
        ("germination", "En germination"),
        ("pepiniere", "En pepiniere"),
        ("epuise", "Epuise"),
        ("rejete", "Rejete"),
    ]

    code_lot = models.CharField(max_length=30, unique=True, blank=True)
    variete = models.CharField(max_length=120)
    fournisseur = models.CharField(max_length=160, blank=True)
    origine = models.CharField(max_length=160, blank=True)
    certification = models.CharField(max_length=160, blank=True)
    date_acquisition = models.DateField()
    date_mise_en_germination = models.DateField(null=True, blank=True)
    nombre_graines = models.PositiveIntegerField(default=0)
    nombre_graines_germees = models.PositiveIntegerField(null=True, blank=True)
    taux_germination = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="acquis")
    observations = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lots_semences",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lot_semence"
        ordering = ["-date_acquisition", "-id"]

    def __str__(self):
        return f"{self.code_lot} - {self.variete}"

    def save(self, *args, **kwargs):
        if not self.code_lot:
            self.code_lot = self._generate_code()
        if self.nombre_graines and self.nombre_graines_germees is not None:
            self.taux_germination = round(self.nombre_graines_germees / self.nombre_graines * 100, 2)
        super().save(*args, **kwargs)

    def _generate_code(self):
        prefix = slugify(self.variete or "semence", allow_unicode=False).replace("-", "").upper()[:8] or "SEM"
        year = self.date_acquisition.year if self.date_acquisition else "0000"
        base = f"SEM-{year}-{prefix}"
        candidate = base
        index = 1
        while LotSemence.objects.filter(code_lot=candidate).exists():
            index += 1
            candidate = f"{base}-{index}"
        return candidate[:30]


class LotPepiniere(models.Model):
    STATUT_CHOICES = [
        ("en_cours", "En cours"),
        ("pret", "Pret a planter"),
        ("plante", "Plante"),
        ("rejete", "Rejete"),
    ]

    code_lot = models.CharField(max_length=30, unique=True, blank=True)
    lot_semence = models.ForeignKey(LotSemence, on_delete=models.PROTECT, related_name="lots_pepinieres")
    date_entree = models.DateField()
    date_sortie_prevue = models.DateField(null=True, blank=True)
    date_sortie_reelle = models.DateField(null=True, blank=True)
    nombre_plants_initial = models.PositiveIntegerField(default=0)
    nombre_plants_valides = models.PositiveIntegerField(null=True, blank=True)
    nombre_plants_rejetes = models.PositiveIntegerField(default=0)
    nombre_plants_morts = models.PositiveIntegerField(default=0)
    taille_moyenne_cm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    nombre_feuilles_moyen = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    etat_sanitaire = models.CharField(max_length=160, blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="en_cours")
    observations = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lots_pepinieres",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lot_pepiniere"
        ordering = ["-date_entree", "-id"]

    def __str__(self):
        return self.code_lot

    @property
    def taux_survie(self):
        if not self.nombre_plants_initial:
            return 0
        vivants = self.nombre_plants_valides
        if vivants is None:
            vivants = max(0, self.nombre_plants_initial - self.nombre_plants_morts - self.nombre_plants_rejetes)
        return round(vivants / self.nombre_plants_initial * 100, 2)

    def save(self, *args, **kwargs):
        if not self.code_lot:
            self.code_lot = self._generate_code()
        super().save(*args, **kwargs)

    def _generate_code(self):
        year = self.date_entree.year if self.date_entree else "0000"
        base = f"PEP-{year}-{self.lot_semence_id or 'LOT'}"
        candidate = base
        index = 1
        while LotPepiniere.objects.filter(code_lot=candidate).exists():
            index += 1
            candidate = f"{base}-{index}"
        return candidate[:30]


class SuiviPepiniere(models.Model):
    lot_pepiniere = models.ForeignKey(LotPepiniere, on_delete=models.CASCADE, related_name="suivis")
    date_observation = models.DateField()
    nombre_plants_vivants = models.PositiveIntegerField(null=True, blank=True)
    nombre_plants_morts = models.PositiveIntegerField(default=0)
    taille_moyenne_cm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    nombre_feuilles_moyen = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    arrosage = models.CharField(max_length=120, blank=True)
    fertilisation = models.CharField(max_length=160, blank=True)
    maladie = models.CharField(max_length=160, blank=True)
    ravageurs = models.CharField(max_length=160, blank=True)
    etat_sanitaire = models.CharField(max_length=160, blank=True)
    observations = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "suivi_pepiniere"
        ordering = ["-date_observation", "-id"]
        unique_together = ["lot_pepiniere", "date_observation"]

    def __str__(self):
        return f"{self.lot_pepiniere.code_lot} - {self.date_observation}"


class OperationPlantation(models.Model):
    STATUT_CHOICES = [
        ("planifiee", "Planifiee"),
        ("realisee", "Realisee"),
        ("suivi", "En suivi"),
        ("cloturee", "Cloturee"),
    ]

    code_operation = models.CharField(max_length=30, unique=True, blank=True)
    secteur = models.ForeignKey("secteurs.Secteur", on_delete=models.PROTECT, related_name="operations_plantation")
    lot_pepiniere = models.ForeignKey(LotPepiniere, on_delete=models.PROTECT, related_name="operations_plantation")
    date_plantation = models.DateField()
    nombre_plants = models.PositiveIntegerField(default=0)
    densite_plantation = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    ecartement_m = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    age_plants_mois = models.PositiveIntegerField(null=True, blank=True)
    plants_remplaces = models.PositiveIntegerField(default=0)
    conditions_meteo = models.CharField(max_length=160, blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="realisee")
    observations = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operations_plantation",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "operation_plantation"
        ordering = ["-date_plantation", "-id"]

    def __str__(self):
        return f"{self.code_operation} - {self.secteur.code}"

    def save(self, *args, **kwargs):
        if not self.code_operation:
            self.code_operation = self._generate_code()
        if self.densite_plantation is None and self.nombre_plants and self.secteur_id:
            superficie = getattr(self.secteur, "superficie_ha", None)
            if superficie:
                self.densite_plantation = round(self.nombre_plants / float(superficie), 2)
        super().save(*args, **kwargs)

    def _generate_code(self):
        year = self.date_plantation.year if self.date_plantation else "0000"
        secteur_code = getattr(self.secteur, "code", "SEC") if self.secteur_id else "SEC"
        base = f"PLA-{year}-{secteur_code}"[:24]
        candidate = base
        index = 1
        while OperationPlantation.objects.filter(code_operation=candidate).exists():
            index += 1
            candidate = f"{base}-{index}"
        return candidate[:30]


class SuiviCroissance(models.Model):
    ETAT_CHOICES = [
        ("bon", "Bon"),
        ("moyen", "Moyen"),
        ("faible", "Faible"),
        ("critique", "Critique"),
    ]

    secteur = models.ForeignKey("secteurs.Secteur", on_delete=models.CASCADE, related_name="suivis_croissance")
    operation_plantation = models.ForeignKey(
        OperationPlantation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suivis_croissance",
    )
    date_observation = models.DateField()
    hauteur_moyenne_cm = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    nombre_feuilles_moyen = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    mortalite = models.PositiveIntegerField(default=0)
    plants_remplaces = models.PositiveIntegerField(default=0)
    stress_hydrique = models.BooleanField(default=False)
    etat_general = models.CharField(max_length=20, choices=ETAT_CHOICES, default="bon")
    observations = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "suivi_croissance"
        ordering = ["-date_observation", "-id"]
        unique_together = ["secteur", "date_observation"]

    def __str__(self):
        return f"{self.secteur.code} - {self.date_observation}"


class ObservationSanitaire(models.Model):
    GRAVITE_CHOICES = [
        ("faible", "Faible"),
        ("moyenne", "Moyenne"),
        ("elevee", "Elevee"),
        ("critique", "Critique"),
    ]
    STATUT_CHOICES = [
        ("nouvelle", "Nouvelle"),
        ("en_traitement", "En traitement"),
        ("resolue", "Resolue"),
        ("surveillance", "Surveillance"),
    ]

    secteur = models.ForeignKey("secteurs.Secteur", on_delete=models.CASCADE, related_name="observations_sanitaires")
    operation_plantation = models.ForeignKey(
        OperationPlantation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="observations_sanitaires",
    )
    date_observation = models.DateField()
    type_probleme = models.CharField(max_length=160)
    gravite = models.CharField(max_length=20, choices=GRAVITE_CHOICES, default="moyenne")
    surface_touchee_ha = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    action_recommandee = models.TextField(blank=True)
    action_effectuee = models.TextField(blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="nouvelle")
    observations = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "observation_sanitaire"
        ordering = ["-date_observation", "-id"]

    def __str__(self):
        return f"{self.secteur.code} - {self.type_probleme}"