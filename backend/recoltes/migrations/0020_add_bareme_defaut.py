from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0019_add_statut_recu_vente"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametrebonus",
            name="bareme_grands_defaut",
            field=models.PositiveIntegerField(default=60),
        ),
        migrations.AddField(
            model_name="parametrebonus",
            name="bareme_moyens_defaut",
            field=models.PositiveIntegerField(default=50),
        ),
        migrations.AddField(
            model_name="parametrebonus",
            name="bareme_petits_defaut",
            field=models.PositiveIntegerField(default=25),
        ),
    ]
