from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="MaterielEquipement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("numero", models.PositiveIntegerField(unique=True)),
                ("designation", models.CharField(blank=True, max_length=200)),
                ("quantite", models.PositiveIntegerField(default=0)),
                ("etat_physique", models.CharField(blank=True, max_length=120)),
                ("statut_utilisation", models.CharField(blank=True, max_length=120)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]

