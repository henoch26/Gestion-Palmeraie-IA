from django.db import migrations

NOUVEAUX_DROITS = [
    {
        "code": "gerer_clients",
        "label": "Gerer les clients",
        "description": "Ajouter, modifier et supprimer des clients acheteurs",
        "ordre": 8,
    },
    {
        "code": "gerer_recus_vente",
        "label": "Gerer les recus de vente",
        "description": "Voir et modifier les recus de vente de tous les superviseurs",
        "ordre": 9,
    },
]


def populate(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    for d in NOUVEAUX_DROITS:
        Droit.objects.get_or_create(code=d["code"], defaults=d)


def depopulate(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    Droit.objects.filter(code__in=[d["code"] for d in NOUVEAUX_DROITS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_populate_droits_initiaux"),
    ]

    operations = [
        migrations.RunPython(populate, depopulate),
    ]
