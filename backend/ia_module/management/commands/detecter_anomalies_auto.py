"""
Commande de detection automatique des anomalies IA.

Usage : python manage.py detecter_anomalies_auto
Planification : voir CRONJOBS dans config/settings.py.
"""
from django.core.management.base import BaseCommand

from ia_module.models import ModeleIA
from ia_module.services.detecteur_anomalies import DetecteurAnomalies


class Command(BaseCommand):
    help = "Detecte automatiquement les anomalies recentes ou structurelles du module IA."

    def add_arguments(self, parser):
        parser.add_argument(
            "--methode",
            choices=("all", "regles_metier", "isolation_forest", "residu_prediction"),
            default="all",
            help="Methode de detection a executer.",
        )
        parser.add_argument(
            "--skip-ml",
            action="store_true",
            help="Executer uniquement les regles metier, meme si des modeles ML sont actifs.",
        )

    def handle(self, *args, **options):
        detecteur = DetecteurAnomalies()
        methode = options["methode"]
        skip_ml = options["skip_ml"]
        results = {}

        def run(label, callback):
            try:
                anomalies = callback()
                results[label] = len(anomalies)
                self.stdout.write(self.style.SUCCESS(f"{label}: {len(anomalies)} anomalie(s) detectee(s)."))
            except ModeleIA.DoesNotExist:
                results[label] = "modele_absent"
                self.stdout.write(self.style.WARNING(f"{label}: modele actif absent, detection ignoree."))
            except Exception as exc:
                results[label] = f"erreur: {exc}"
                self.stderr.write(self.style.ERROR(f"{label}: {exc}"))

        if methode in ("all", "regles_metier"):
            run("regles_metier", detecteur.detecter_par_regles)

        if not skip_ml and methode in ("all", "isolation_forest"):
            run(
                "isolation_forest",
                lambda: detecteur.detecter_par_isolation_forest(
                    ModeleIA.objects.filter(algorithme="isolation_forest", actif=True).latest("date_entrainement")
                ),
            )

        if not skip_ml and methode in ("all", "residu_prediction"):
            run(
                "residu_prediction",
                lambda: detecteur.detecter_par_residu_prediction(
                    ModeleIA.objects.filter(algorithme="random_forest", actif=True).latest("date_entrainement")
                ),
            )

        total = sum(value for value in results.values() if isinstance(value, int))
        self.stdout.write(self.style.SUCCESS(f"Total cree/verifie: {total} anomalie(s)."))