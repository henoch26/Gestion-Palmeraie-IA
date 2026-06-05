import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0008_ficherecolte_conditions_meteo_and_more"),
        ("recolteurs", "0007_rename_recolteur_to_personnel"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ficherecolteligne",
            name="recolteur",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="lignes_recolte",
                to="recolteurs.personnel",
            ),
        ),
    ]
