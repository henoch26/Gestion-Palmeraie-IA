from django.db import migrations

DROITS = [
    {"code": "gerer_recolteurs", "label": "Gerer les recolteurs",     "description": "Ajouter, modifier et supprimer des recolteurs", "ordre": 1},
    {"code": "gerer_agents",     "label": "Gerer les agents terrain", "description": "Ajouter, modifier et supprimer des agents terrain", "ordre": 2},
    {"code": "gerer_materiels",  "label": "Gerer les materiels",      "description": "Ajouter, modifier et supprimer des materiels", "ordre": 3},
    {"code": "gerer_secteurs",   "label": "Gerer les secteurs",       "description": "Modifier les informations des secteurs", "ordre": 4},
    {"code": "voir_analyses",    "label": "Voir les analyses",        "description": "Acceder aux graphiques et analyses de production", "ordre": 5},
    {"code": "exporter_donnees", "label": "Exporter les donnees",     "description": "Telecharger les exports Excel et CSV", "ordre": 6},
    {"code": "gerer_travaux",    "label": "Gerer les travaux",        "description": "Saisir et modifier des fiches de travaux", "ordre": 7},
]


def populate(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    for d in DROITS:
        Droit.objects.get_or_create(code=d["code"], defaults=d)


def depopulate(apps, schema_editor):
    Droit = apps.get_model("accounts", "Droit")
    Droit.objects.filter(code__in=[d["code"] for d in DROITS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_add_droit_model_and_permissions"),
    ]

    operations = [
        migrations.RunPython(populate, depopulate),
    ]
