from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0021_add_annule_to_action_log"),
    ]

    operations = [
        migrations.AlterField(
            model_name="actionlog",
            name="action",
            field=models.CharField(
                max_length=40,
                choices=[
                    ("validation",             "Validation fiche"),
                    ("rejet",                  "Rejet fiche"),
                    ("modification_fiche",     "Modification fiche"),
                    ("modification_bareme",    "Modification barème"),
                    ("prix_officiel",          "Saisie/modif prix officiel"),
                    ("modification_recu",      "Modification reçu de vente"),
                    ("suppression_recu",       "Suppression reçu de vente"),
                    ("validation_recu",        "Validation reçu de vente"),
                    ("creation_fiche",         "Création fiche récolte"),
                    ("soumission_fiche",       "Soumission fiche récolte"),
                    ("suppression_fiche",      "Suppression fiche récolte"),
                    ("creation_recolteur",     "Création récolteur"),
                    ("modification_recolteur", "Modification récolteur"),
                    ("suppression_recolteur",  "Suppression récolteur"),
                    ("creation_secteur",       "Création secteur"),
                    ("modification_secteur",   "Modification secteur"),
                    ("suppression_secteur",    "Suppression secteur"),
                    ("creation_agent",         "Création agent terrain"),
                    ("modification_agent",     "Modification agent terrain"),
                    ("suppression_agent",      "Suppression agent terrain"),
                    ("creation_materiel",      "Création matériel"),
                    ("modification_materiel",  "Modification matériel"),
                    ("suppression_materiel",   "Suppression matériel"),
                    ("creation_client",        "Création client"),
                    ("modification_client",    "Modification client"),
                    ("suppression_client",     "Suppression client"),
                    ("creation_travaux",       "Création fiche travaux"),
                    ("soumission_travaux",     "Soumission fiche travaux"),
                    ("suppression_travaux",    "Suppression fiche travaux"),
                    ("annulation_action",      "Annulation d'action superviseur"),
                ],
            ),
        ),
    ]
