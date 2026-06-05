"""
Migration correcte : RenameModel Recolteur -> Personnel + ajout des nouveaux champs.
Préserve toutes les données existantes en renommant la table au lieu de la recréer.
"""
import django.db.models.deletion
from django.db import migrations, models


def generate_codes(apps, schema_editor):
    """Génère le code PER-xxx pour chaque enregistrement existant."""
    Personnel = apps.get_model("recolteurs", "Personnel")
    for obj in Personnel.objects.order_by("id"):
        Personnel.objects.filter(pk=obj.pk).update(code=f"PER-{obj.pk:03d}")


class Migration(migrations.Migration):

    dependencies = [
        ("recolteurs", "0006_remove_recolteur_code_recolteur_est_mobile_money_and_more"),
    ]

    operations = [
        # 1. Renommer la table (preserves data)
        migrations.RenameModel("Recolteur", "Personnel"),

        # 2. Mettre à jour les options du modèle
        migrations.AlterModelOptions(
            name="personnel",
            options={"verbose_name": "Personnel", "verbose_name_plural": "Personnel"},
        ),

        # 3. Ajouter le champ code (sans unique d'abord)
        migrations.AddField(
            model_name="personnel",
            name="code",
            field=models.CharField(blank=True, max_length=20, default=""),
            preserve_default=False,
        ),

        # 4. Générer des codes uniques pour les enregistrements existants
        migrations.RunPython(generate_codes, migrations.RunPython.noop),

        # 5. Ajouter la contrainte unique maintenant que les codes sont définis
        migrations.AlterField(
            model_name="personnel",
            name="code",
            field=models.CharField(blank=True, max_length=20, unique=True),
        ),

        # 6. Nouveaux champs
        migrations.AddField(
            model_name="personnel",
            name="telephone",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="personnel",
            name="date_naissance",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="personnel",
            name="photo",
            field=models.ImageField(blank=True, null=True, upload_to="personnel/photos/"),
        ),
        migrations.AddField(
            model_name="personnel",
            name="contrat",
            field=models.CharField(
                blank=True,
                choices=[("journalier", "Journalier"), ("permanent", "Permanent")],
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="personnel",
            name="date_embauche",
            field=models.DateField(blank=True, null=True),
        ),
    ]
