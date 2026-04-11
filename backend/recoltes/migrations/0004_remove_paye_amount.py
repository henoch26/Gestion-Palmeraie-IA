from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0003_drop_paiements_tables"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="ficherecolteligne",
            name="paye_amount",
        ),
    ]

