from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0020_add_bareme_defaut"),
    ]

    operations = [
        migrations.AddField(
            model_name="actionlog",
            name="annule",
            field=models.BooleanField(default=False),
        ),
    ]
