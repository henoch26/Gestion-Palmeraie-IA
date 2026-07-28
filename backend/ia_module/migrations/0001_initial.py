"""Migration initiale du module IA : ModeleIA, Prediction, Anomalie, DonneeMeteo."""
import django.db.models.deletion
import ia_module.models
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("secteurs",  "0006_alter_secteur_table"),
        ("recolteurs","0009_supprimer_champs_inutiles"),
        ("recoltes",  "0025_add_validation_rejet_travaux"),
        ("accounts",  "0012_add_encadreur_technique_role"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ModeleIA",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=120)),
                ("algorithme", models.CharField(
                    choices=[
                        ("linear_regression",   "RÃ©gression LinÃ©aire"),
                        ("random_forest",       "Random Forest Regressor"),
                        ("decision_tree",       "Arbre de DÃ©cision"),
                        ("logistic_regression", "RÃ©gression Logistique"),
                        ("isolation_forest",    "Isolation Forest"),
                    ],
                    max_length=40,
                )),
                ("type_tache", models.CharField(
                    choices=[
                        ("regression",     "RÃ©gression (prÃ©diction rendement)"),
                        ("classification", "Classification (anomalie supervisÃ©e)"),
                        ("anomalie",       "DÃ©tection d'anomalies (non supervisÃ©e)"),
                    ],
                    max_length=20,
                )),
                ("version", models.PositiveIntegerField(default=1)),
                ("chemin_fichier", models.FileField(blank=True, upload_to=ia_module.models.modele_upload_path)),
                ("metriques", models.JSONField(default=dict)),
                ("features", models.JSONField(default=list)),
                ("nb_observations", models.PositiveIntegerField(default=0)),
                ("actif", models.BooleanField(default=True)),
                ("date_entrainement", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="modeles_ia",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "modele_ia", "ordering": ["-date_entrainement"]},
        ),
        migrations.CreateModel(
            name="Prediction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("annee_cible", models.PositiveIntegerField()),
                ("mois_cible", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("valeur_predite", models.DecimalField(decimal_places=2, max_digits=12)),
                ("intervalle_bas", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("intervalle_haut", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("valeur_reelle", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("features_utilisees", models.JSONField(default=dict)),
                ("date_prediction", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="predictions_ia",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("modele", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="predictions",
                    to="ia_module.modeleia",
                )),
                ("recolteur", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="predictions_ia",
                    to="recolteurs.personnel",
                )),
                ("secteur", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="predictions_ia",
                    to="secteurs.secteur",
                )),
            ],
            options={"db_table": "prediction_ia", "ordering": ["-date_prediction"]},
        ),
        migrations.CreateModel(
            name="Anomalie",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("type_anomalie", models.CharField(
                    choices=[
                        ("recolte",   "Anomalie rÃ©colte"),
                        ("rendement", "Anomalie rendement"),
                        ("recolteur", "Anomalie rÃ©colteur"),
                        ("poids",     "Anomalie poids/rÃ©gimes"),
                    ],
                    max_length=20,
                )),
                ("criticite", models.CharField(
                    choices=[
                        ("faible",   "Faible"),
                        ("moyenne",  "Moyenne"),
                        ("elevee",   "Ã‰levÃ©e"),
                        ("critique", "Critique"),
                    ],
                    default="moyenne",
                    max_length=10,
                )),
                ("statut", models.CharField(
                    choices=[
                        ("nouvelle", "Nouvelle"),
                        ("validee",  "ValidÃ©e"),
                        ("rejetee",  "RejetÃ©e"),
                    ],
                    default="nouvelle",
                    max_length=10,
                )),
                ("description", models.TextField()),
                ("valeur_observee", models.DecimalField(decimal_places=2, max_digits=14)),
                ("valeur_reference", models.DecimalField(decimal_places=2, max_digits=14)),
                ("ecart_pct", models.DecimalField(decimal_places=2, max_digits=8)),
                ("methode_detection", models.CharField(
                    choices=[
                        ("regles_metier",       "RÃ¨gles mÃ©tier"),
                        ("isolation_forest",    "Isolation Forest"),
                        ("decision_tree",       "Arbre de dÃ©cision"),
                        ("logistic_regression", "RÃ©gression logistique"),
                    ],
                    default="regles_metier",
                    max_length=30,
                )),
                ("score_anomalie", models.FloatField(blank=True, null=True)),
                ("validated_at", models.DateTimeField(blank=True, null=True)),
                ("details", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("fiche_recolte", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="anomalies_ia",
                    to="recoltes.ficherecolte",
                )),
                ("recolteur", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="anomalies_ia",
                    to="recolteurs.personnel",
                )),
                ("secteur", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="anomalies_ia",
                    to="secteurs.secteur",
                )),
                ("validated_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="anomalies_validees",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "anomalie_ia", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="DonneeMeteo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("temperature_max", models.FloatField(blank=True, null=True)),
                ("temperature_min", models.FloatField(blank=True, null=True)),
                ("temperature_moy", models.FloatField(blank=True, null=True)),
                ("precipitation_mm", models.FloatField(blank=True, null=True)),
                ("humidite_pct", models.FloatField(blank=True, null=True)),
                ("vitesse_vent_kmh", models.FloatField(blank=True, null=True)),
                ("description", models.CharField(blank=True, max_length=200)),
                ("source", models.CharField(blank=True, default="open-meteo", max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("secteur", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="donnees_meteo",
                    to="secteurs.secteur",
                )),
            ],
            options={
                "db_table": "donnee_meteo",
                "ordering": ["-date"],
                "unique_together": {("date", "secteur")},
            },
        ),
    ]

