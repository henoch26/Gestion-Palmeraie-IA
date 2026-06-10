from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0018_add_action_log"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="ficherecuvente",
            name="statut",
            field=models.CharField(
                choices=[("brouillon", "Brouillon"), ("valide", "Validé")],
                default="brouillon",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="ficherecuvente",
            name="validated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="recus_valides",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="ficherecuvente",
            name="validated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="actionlog",
            name="action",
            field=models.CharField(
                choices=[
                    ("validation", "Validation fiche"),
                    ("rejet", "Rejet fiche"),
                    ("modification_fiche", "Modification fiche"),
                    ("modification_bareme", "Modification barème"),
                    ("prix_officiel", "Saisie/modif prix officiel"),
                    ("modification_recu", "Modification reçu de vente"),
                    ("suppression_recu", "Suppression reçu de vente"),
                    ("validation_recu", "Validation reçu de vente"),
                ],
                max_length=40,
            ),
        ),
    ]
