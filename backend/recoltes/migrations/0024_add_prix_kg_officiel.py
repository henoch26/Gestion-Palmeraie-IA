from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0023_add_missing_action_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametrebonus",
            name="prix_kg_officiel",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
