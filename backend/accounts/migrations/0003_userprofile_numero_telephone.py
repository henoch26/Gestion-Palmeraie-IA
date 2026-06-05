from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_must_change_password"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="numero_telephone",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
