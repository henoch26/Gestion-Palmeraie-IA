from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("secteurs", "0003_align_secteur_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="FicheTravaux",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("superviseur_travaux", models.CharField(blank=True, max_length=120)),
                ("nature_travaux", models.CharField(blank=True, max_length=255)),
                ("superficie_couverte_ha", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("periode_travaux", models.CharField(blank=True, max_length=120)),
                ("nb_personnes", models.PositiveIntegerField(blank=True, null=True)),
                ("observations", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="ConsommableTravaux",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("designation", models.CharField(max_length=200)),
                ("quantite", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("unite", models.CharField(blank=True, max_length=40)),
                ("prix_unitaire", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("fiche", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="consommables", to="travaux.fichetravaux")),
            ],
        ),
        migrations.CreateModel(
            name="RepartitionTache",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom_prenom", models.CharField(max_length=120)),
                ("nature_taches", models.CharField(blank=True, max_length=200)),
                ("quantite", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("prix_unitaire", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("fiche", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="repartitions", to="travaux.fichetravaux")),
            ],
        ),
        migrations.AddField(
            model_name="fichetravaux",
            name="secteurs_couverts",
            field=models.ManyToManyField(blank=True, related_name="fiches_travaux", to="secteurs.secteur"),
        ),
    ]

