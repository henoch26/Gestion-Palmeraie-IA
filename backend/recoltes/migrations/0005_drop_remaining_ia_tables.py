# Generated after removing the IA module from the project.

from django.db import migrations


def drop_remaining_ia_tables(apps, schema_editor):
    tables = [
        "ia_parametreia",
        "ia_predictionscenario",
        "ia_anomalie",
        "ia_facteurproduction",
    ]

    cascade = " CASCADE" if schema_editor.connection.vendor == "postgresql" else ""
    for table in tables:
        schema_editor.execute(f"DROP TABLE IF EXISTS {table}{cascade};")


class Migration(migrations.Migration):

    dependencies = [
        ("recoltes", "0004_remove_paye_amount"),
    ]

    operations = [
        migrations.RunPython(drop_remaining_ia_tables, migrations.RunPython.noop),
    ]
