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
    superviseur_general_obj = models.ForeignKey(
        "agents.SuperviseurGeneral",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches_supervisees",
    )
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
    STATUT_CHOICES = [
        ("brouillon", "Brouillon"),
        ("valide",    "Validé"),
    ]
    MODE_PAIEMENT_CHOICES = [
        ("espece",   "Espèce"),
        ("virement", "Virement"),
    ]

    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="brouillon")
    validated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="recus_valides",
    )
    validated_at = models.DateTimeField(null=True, blank=True)

    fiche = models.ForeignKey(
        FicheRecolte, on_delete=models.CASCADE, related_name="recus"
    )
    date = models.DateField(null=True, blank=True)
    client = models.CharField(max_length=120, blank=True)
    client_obj = models.ForeignKey(
        "Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recus",
    )
    pesee_kg = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    non_conformes_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    montant = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prix_officiel = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    reference_facture = models.CharField(max_length=80, null=True, blank=True)
    mode_paiement = models.CharField(max_length=20, choices=MODE_PAIEMENT_CHOICES, null=True, blank=True)
    vehicule_transport = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "recu_vente"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"Recu {self.date} - {self.client}"

    @property
    def prix_calcule(self):
        from decimal import Decimal, ROUND_HALF_UP
        if self.pesee_kg and self.pesee_kg > 0:
            result = self.montant / self.pesee_kg
            return float(result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        return None

    @property
    def rapport_prix(self):
        from decimal import Decimal
        pc = self.prix_calcule
        if pc and self.prix_officiel and self.prix_officiel > 0:
            return round(Decimal(str(pc)) / self.prix_officiel, 4)
        return None


class ParametreBonus(models.Model):
    """Singleton : paramètres globaux (barème récolteurs + bonus non conformes)."""
    # Barème par défaut pour les nouvelles fiches (FCFA par régime)
    bareme_grands_defaut  = models.PositiveIntegerField(default=60)
    bareme_moyens_defaut  = models.PositiveIntegerField(default=50)
    bareme_petits_defaut  = models.PositiveIntegerField(default=25)
    # Bonus qualité régimes non conformes
    seuil_non_conformes = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    montant_bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Prix officiel du kg fixé par les acteurs agro-industriels
    prix_kg_officiel = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "parametre_bonus"

    @classmethod
    def get_instance(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"Bonus seuil={self.seuil_non_conformes}% montant={self.montant_bonus}"


class ActionLog(models.Model):
    """Journal des actions effectuées sur les données (admin et superviseurs)."""
    ACTION_CHOICES = [
        # ── Actions admin ──────────────────────────────────────────
        ("validation",              "Validation fiche"),
        ("rejet",                   "Rejet fiche"),
        ("modification_fiche",      "Modification fiche"),
        ("modification_bareme",     "Modification barème"),
        ("prix_officiel",           "Saisie/modif prix officiel"),
        ("creation_recu",           "Création reçu de vente"),
        ("modification_recu",       "Modification reçu de vente"),
        ("suppression_recu",        "Suppression reçu de vente"),
        ("validation_recu",         "Validation reçu de vente"),
        ("rejet_recu",              "Rejet reçu de vente"),
        # ── Actions superviseur — fiches & récolteurs ──────────────
        ("creation_fiche",          "Création fiche récolte"),
        ("soumission_fiche",        "Soumission fiche récolte"),
        ("suppression_fiche",       "Suppression fiche récolte"),
        ("creation_recolteur",      "Création récolteur"),
        ("modification_recolteur",  "Modification récolteur"),
        ("suppression_recolteur",   "Suppression récolteur"),
        # ── Actions sur les référentiels ───────────────────────────
        ("creation_secteur",        "Création secteur"),
        ("modification_secteur",    "Modification secteur"),
        ("suppression_secteur",     "Suppression secteur"),
        ("creation_agent",          "Création agent terrain"),
        ("modification_agent",      "Modification agent terrain"),
        ("suppression_agent",       "Suppression agent terrain"),
        ("creation_materiel",       "Création matériel"),
        ("modification_materiel",   "Modification matériel"),
        ("suppression_materiel",    "Suppression matériel"),
        # ── Clients ────────────────────────────────────────────────
        ("creation_client",         "Création client"),
        ("modification_client",     "Modification client"),
        ("suppression_client",      "Suppression client"),
        # ── Superviseurs généraux ──────────────────────────────────
        ("creation_superviseur_general",     "Création superviseur général"),
        ("modification_superviseur_general", "Modification superviseur général"),
        ("suppression_superviseur_general",  "Suppression superviseur général"),
        # ── Comptes utilisateurs ───────────────────────────────────
        ("creation_utilisateur",     "Création compte utilisateur"),
        ("modification_utilisateur", "Modification compte utilisateur"),
        ("suppression_utilisateur",  "Suppression compte utilisateur"),
        # ── Fiches travaux ─────────────────────────────────────────
        ("creation_travaux",         "Création fiche travaux"),
        ("modification_travaux",     "Modification fiche travaux"),
        ("soumission_travaux",       "Soumission fiche travaux"),
        ("validation_travaux",       "Validation fiche travaux"),
        ("rejet_travaux",            "Rejet fiche travaux"),
        ("suppression_travaux",      "Suppression fiche travaux"),
        # ── Matériel utilisé dans les travaux ─────────────────────
        ("creation_materiel_travaux",     "Ajout matériel dans travaux"),
        ("modification_materiel_travaux", "Modification matériel dans travaux"),
        ("suppression_materiel_travaux",  "Retrait matériel dans travaux"),
        # ── Annulations admin ──────────────────────────────────────
        ("annulation_action",        "Annulation d'action superviseur"),
        # ── Connexions ─────────────────────────────────────────────
        ("connexion_reussie",               "Connexion réussie"),
        ("tentative_connexion_echouee",     "Tentative de connexion échouée"),
        ("tentative_connexion_desactivee",  "Tentative de connexion (compte désactivé)"),
    ]

    acteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="actions_effectuees",
    )
    superviseur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actions_subies",
    )
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    fiche = models.ForeignKey(
        FicheRecolte,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_logs",
    )
    recu = models.ForeignKey(
        FicheRecuVente,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="action_logs",
    )
    detail = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    annule = models.BooleanField(default=False)

    class Meta:
        db_table = "action_log"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.acteur} — {self.action} — {self.timestamp:%Y-%m-%d %H:%M}"
