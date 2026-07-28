"""Ajoute le rôle Encadreur Technique dans UserProfile."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0011_rename_gerer_secteurs_to_consulter_secteur"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userprofile",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin",                "Administrateur"),
                    ("superviseur",          "Superviseur"),
                    ("superviseur_adjoint",  "Superviseur adjoint"),
                    ("encadreur_technique",  "Encadreur Technique"),
                ],
                default="superviseur",
                max_length=30,
            ),
        ),
    ]
