"""
Commande Django : entraîne tous les modèles ML ou un algorithme spécifique.
Usage : python manage.py entrainer_modeles [--algo random_forest]
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Entraîne les modèles ML du module IA"

    def add_arguments(self, parser):
        parser.add_argument(
            "--algo",
            type=str,
            default=None,
            help="Algorithme à entraîner (linear_regression, random_forest, decision_tree, logistic_regression, isolation_forest)",
        ) 

    def handle(self, *args, **options):
        from ia_module.services.predicteur_rendement import PredicteurRendement
        from ia_module.services.detecteur_anomalies import DetecteurAnomalies

        algo = options.get("algo")
        predicteur = PredicteurRendement()
        detecteur  = DetecteurAnomalies()

        TRAINERS = {
            "linear_regression":   predicteur.entrainer_regression_lineaire,
            "random_forest":       predicteur.entrainer_random_forest,
            "decision_tree":       detecteur.entrainer_decision_tree,
            "logistic_regression": detecteur.entrainer_logistic_regression,
            "isolation_forest":    detecteur.entrainer_isolation_forest,
        }

        to_train = [algo] if algo else list(TRAINERS.keys())

        for a in to_train:
            if a not in TRAINERS:
                self.stderr.write(self.style.WARNING(f"Algorithme inconnu : {a}"))
                continue
            self.stdout.write(f"  Entraînement de {a}...")
            try:
                modele = TRAINERS[a]()
                self.stdout.write(self.style.SUCCESS(f"  [OK] {modele.nom} (id={modele.pk})"))
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  [ERR] {a} : {exc}"))

        self.stdout.write(self.style.SUCCESS("Entrainement termine."))
