from django.db import migrations


def rename_forward(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    Droit.objects.filter(code="gerer_secteurs").update(
        code="consulter_secteur",
        label="Consulter les secteurs",
        description="Voir les details des secteurs",
    )


def rename_backward(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    Droit.objects.filter(code="consulter_secteur").update(
        code="gerer_secteurs",
        label="Gerer les secteurs",
        description="Modifier les informations des secteurs",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_password_reset_token"),
    ]

    operations = [
        migrations.RunPython(rename_forward, rename_backward),
    ]
