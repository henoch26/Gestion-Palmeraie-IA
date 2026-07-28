"""
Commande Django : evalue les modeles de rendement sur une periode de test gardee a part.
Usage : python manage.py evaluer_modeles --test-start 2024-01 --test-end 2026-06
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Evalue les modeles de rendement par backtesting temporel"

    def add_arguments(self, parser):
        parser.add_argument(
            "--algo",
            action="append",
            default=None,
            help="Algorithme a evaluer. Peut etre repete. Defaut : random_forest et linear_regression.",
        )
        parser.add_argument("--test-start", default="2024-01", help="Debut du jeu de test au format YYYY-MM.")
        parser.add_argument("--test-end", default=None, help="Fin du jeu de test au format YYYY-MM.")

    def handle(self, *args, **options):
        from ia_module.services.evaluation_modeles import EvaluationModeles

        rapport = EvaluationModeles().evaluer_rendement(
            algorithmes=options.get("algo"),
            test_start=options.get("test_start"),
            test_end=options.get("test_end"),
        )

        split = rapport["split"]
        self.stdout.write(
            f"Donnees : {rapport['periode_donnees']['debut']} -> {rapport['periode_donnees']['fin']} "
            f"({rapport['periode_donnees']['observations']} observations)"
        )
        self.stdout.write(
            f"Entrainement : {split['train_start']} -> {split['train_end']} "
            f"({split['train_observations']} obs.)"
        )
        self.stdout.write(
            f"Test : {split['test_start']} -> {split['test_end']} "
            f"({split['test_observations']} obs.)"
        )

        for resultat in rapport["resultats"]:
            m = resultat["metriques"]
            r2 = m["r2"]
            r2_text = f"{r2:.3f}" if r2 is not None else "-"
            mape = m["mape"]
            mape_text = f"{mape:.2f}%" if mape is not None else "-"
            self.stdout.write(
                self.style.SUCCESS(
                    f"{resultat['algorithme']} | RMSE={m['rmse']:.2f} | MAE={m['mae']:.2f} | "
                    f"R2={r2_text} | MAPE={mape_text} | fiabilite={m['niveau_fiabilite']}"
                )
            )

        meilleur = rapport["meilleur"]
        self.stdout.write(self.style.SUCCESS(f"Meilleur modele sur test : {meilleur['algorithme']}"))
