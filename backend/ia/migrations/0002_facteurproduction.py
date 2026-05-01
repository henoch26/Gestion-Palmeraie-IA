from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ia", "0001_initial"),
        ("secteurs", "0004_remove_secteur_annee_plantation"),
    ]

    operations = [
        migrations.CreateModel(
            name="FacteurProduction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveIntegerField()),
                ("month", models.PositiveSmallIntegerField()),
                ("pluviometrie_mm", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("temperature_moyenne", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("humidite_air_pct", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("jours_secheresse", models.PositiveIntegerField(blank=True, null=True)),
                ("jours_pluie", models.PositiveIntegerField(blank=True, null=True)),
                ("vents_forts", models.BooleanField(default=False)),
                ("humidite_sol_pct", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("ph_sol", models.DecimalField(blank=True, decimal_places=2, max_digits=4, null=True)),
                ("fertilite_sol_indice", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("drainage_sol_indice", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("age_palmiers_annees", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("jours_depuis_derniere_recolte", models.PositiveIntegerField(blank=True, null=True)),
                ("frequence_recolte_jours", models.PositiveIntegerField(blank=True, null=True)),
                ("desherbage_effectue", models.BooleanField(default=False)),
                ("fertilisation_effectuee", models.BooleanField(default=False)),
                ("traitement_phytosanitaire", models.BooleanField(default=False)),
                ("elagage_effectue", models.BooleanField(default=False)),
                ("engrais_kg", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("pesticide_l", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("herbicide_l", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("cout_intrants_fcfa", models.PositiveIntegerField(blank=True, null=True)),
                ("maladie_detectee", models.BooleanField(default=False)),
                ("niveau_infestation", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("main_oeuvre_disponible", models.PositiveIntegerField(blank=True, null=True)),
                ("absenteisme_pct", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                (
                    "accessibilite_secteur",
                    models.CharField(
                        choices=[("bonne", "Bonne"), ("moyenne", "Moyenne"), ("difficile", "Difficile")],
                        default="moyenne",
                        max_length=20,
                    ),
                ),
                ("distance_collecte_km", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("incident_signale", models.BooleanField(default=False)),
                ("type_incident", models.CharField(blank=True, max_length=120)),
                ("severite_incident", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ("observations", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "secteur",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="facteurs_production",
                        to="secteurs.secteur",
                    ),
                ),
            ],
            options={
                "ordering": ["-year", "-month", "secteur__code"],
            },
        ),
        migrations.AddIndex(
            model_name="facteurproduction",
            index=models.Index(fields=["year", "month"], name="ia_facteurp_year_e1f91f_idx"),
        ),
        migrations.AddIndex(
            model_name="facteurproduction",
            index=models.Index(fields=["secteur", "year"], name="ia_facteurp_secteu_c0b843_idx"),
        ),
        migrations.AddConstraint(
            model_name="facteurproduction",
            constraint=models.UniqueConstraint(
                fields=("secteur", "year", "month"),
                name="uniq_facteur_production_secteur_month",
            ),
        ),
    ]
