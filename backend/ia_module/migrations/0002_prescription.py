import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ia_module", "0001_initial"),
        ("secteurs", "0006_alter_secteur_table"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Prescription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("annee_cible", models.PositiveIntegerField()),
                ("mois_cible", models.PositiveSmallIntegerField()),
                ("objectif_regimes", models.DecimalField(decimal_places=2, max_digits=12)),
                ("rendement_predit", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("ecart_objectif_pct", models.FloatField(default=0)),
                ("nb_recolteurs_recommande", models.PositiveSmallIntegerField(default=0)),
                ("nb_heures_recommande", models.DecimalField(decimal_places=1, default=7, max_digits=5)),
                ("frequence_cycle_jours", models.PositiveSmallIntegerField(default=15)),
                ("nb_fiches_recommande", models.PositiveSmallIntegerField(default=2)),
                ("facteur_saisonnier", models.FloatField(default=1.0)),
                ("score_confiance", models.FloatField(default=0)),
                ("productivite_moy", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("conseils", models.JSONField(default=list)),
                ("alertes", models.JSONField(default=list)),
                ("details_calcul", models.JSONField(default=dict)),
                ("statut", models.CharField(choices=[("nouvelle", "Nouvelle"), ("appliquee", "Appliquée"), ("ignoree", "Ignorée")], default="nouvelle", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="prescriptions_ia", to=settings.AUTH_USER_MODEL)),
                ("secteur", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="prescriptions_ia", to="secteurs.secteur")),
            ],
            options={"db_table": "prescription_ia", "ordering": ["-created_at"]},
        ),
    ]


