from django.db import models


class FacteurProduction(models.Model):
    # Variables explicatives mensuelles qui influencent le rendement d'un secteur.
    ACCESSIBILITE_BONNE = "bonne"
    ACCESSIBILITE_MOYENNE = "moyenne"
    ACCESSIBILITE_DIFFICILE = "difficile"

    ACCESSIBILITE_CHOICES = [
        (ACCESSIBILITE_BONNE, "Bonne"),
        (ACCESSIBILITE_MOYENNE, "Moyenne"),
        (ACCESSIBILITE_DIFFICILE, "Difficile"),
    ]

    secteur = models.ForeignKey(
        "secteurs.Secteur",
        on_delete=models.CASCADE,
        related_name="facteurs_production",
    )
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()

    # Meteo
    pluviometrie_mm = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    temperature_moyenne = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    humidite_air_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    jours_secheresse = models.PositiveIntegerField(null=True, blank=True)
    jours_pluie = models.PositiveIntegerField(null=True, blank=True)
    vents_forts = models.BooleanField(default=False)

    # Sol et plantation
    humidite_sol_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    ph_sol = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    fertilite_sol_indice = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    drainage_sol_indice = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    age_palmiers_annees = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    # Entretien / travaux / intrants
    jours_depuis_derniere_recolte = models.PositiveIntegerField(null=True, blank=True)
    frequence_recolte_jours = models.PositiveIntegerField(null=True, blank=True)
    desherbage_effectue = models.BooleanField(default=False)
    fertilisation_effectuee = models.BooleanField(default=False)
    traitement_phytosanitaire = models.BooleanField(default=False)
    elagage_effectue = models.BooleanField(default=False)
    engrais_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    pesticide_l = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    herbicide_l = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cout_intrants_fcfa = models.PositiveIntegerField(null=True, blank=True)

    # Risques et contraintes
    maladie_detectee = models.BooleanField(default=False)
    niveau_infestation = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    main_oeuvre_disponible = models.PositiveIntegerField(null=True, blank=True)
    absenteisme_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    accessibilite_secteur = models.CharField(
        max_length=20,
        choices=ACCESSIBILITE_CHOICES,
        default=ACCESSIBILITE_MOYENNE,
    )
    distance_collecte_km = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    incident_signale = models.BooleanField(default=False)
    type_incident = models.CharField(max_length=120, blank=True)
    severite_incident = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    observations = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["secteur", "year", "month"], name="uniq_facteur_production_secteur_month")
        ]
        indexes = [
            models.Index(fields=["year", "month"]),
            models.Index(fields=["secteur", "year"]),
        ]
        ordering = ["-year", "-month", "secteur__code"]

    def __str__(self):
        return f"{self.secteur.code} - {self.month:02d}/{self.year}"


class ParametreIA(models.Model):
    # Parametres simples pour regler les seuils / fenetres d'apprentissage
    key = models.CharField(max_length=80, unique=True)
    value = models.JSONField(default=dict, blank=True)
    description = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.key


class PredictionScenario(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    algorithm = models.CharField(max_length=80, default="seasonal_linear_v1")
    year = models.PositiveIntegerField()
    horizon_months = models.PositiveIntegerField(default=6)

    secteur = models.ForeignKey(
        "secteurs.Secteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prediction_scenarios",
    )

    metrics = models.JSONField(default=dict, blank=True)
    predictions = models.JSONField(default=list, blank=True)

    def __str__(self):
        target = self.secteur.code if self.secteur else "GLOBAL"
        return f"Prediction {target} - {self.year}"


class Anomalie(models.Model):
    NIVEAU_FAIBLE = "faible"
    NIVEAU_MOYEN = "moyen"
    NIVEAU_ELEVE = "eleve"

    NIVEAU_CHOICES = [
        (NIVEAU_FAIBLE, "Faible"),
        (NIVEAU_MOYEN, "Moyen"),
        (NIVEAU_ELEVE, "Eleve"),
    ]

    created_at = models.DateTimeField(auto_now_add=True)
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(null=True, blank=True)
    date = models.DateField(null=True, blank=True)

    type = models.CharField(max_length=80)  # ex: "rendement_secteur_outlier", "non_conformes_pct_high"
    niveau = models.CharField(max_length=10, choices=NIVEAU_CHOICES, default=NIVEAU_MOYEN)
    metric = models.CharField(max_length=80, blank=True)  # ex: "quantite", "rendement_ha", "non_conformes_pct"

    value = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    expected_min = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    expected_max = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)

    message = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)

    secteur = models.ForeignKey(
        "secteurs.Secteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anomalies",
    )
    recolteur = models.ForeignKey(
        "recolteurs.Recolteur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anomalies",
    )
    fiche = models.ForeignKey(
        "recoltes.FicheRecolte",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anomalies",
    )

    resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["year", "type"]),
            models.Index(fields=["resolved"]),
        ]

    def __str__(self):
        return f"{self.type} ({self.year})"
