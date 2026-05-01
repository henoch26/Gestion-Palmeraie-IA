# Generated after removing the paiements module from the project.

from django.db import migrations


def drop_remaining_paiements_tables(apps, schema_editor):
    cascade = " CASCADE" if schema_editor.connection.vendor == "postgresql" else ""
    schema_editor.execute(f"DROP TABLE IF EXISTS paiements_paiement{cascade};")


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0005_drop_remaining_ia_tables"),
    ]

    operations = [
        migrations.RunPython(drop_remaining_paiements_tables, migrations.RunPython.noop),
    ]
