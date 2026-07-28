"""
Exporte les metriques IA pour le rapport de memoire.

Exemples:
  python manage.py exporter_metriques_ia
  python manage.py exporter_metriques_ia --test-start 2024-01 --test-end 2026-06
  python manage.py exporter_metriques_ia --format markdown --output reports/ia
"""
import csv
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone


def _round(value, digits=4):
    if value is None:
        return ""
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return value


def _pct(value, digits=2):
    if value is None:
        return ""
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return value


def _cell(value):
    if value is None:
        return ""
    text = str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def _markdown_table(rows):
    if not rows:
        return "_Aucune donnee disponible._\n"

    headers = list(rows[0].keys())
    lines = [
        "| " + " | ".join(_cell(h) for h in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_cell(row.get(h, "")) for h in headers) + " |")
    return "\n".join(lines) + "\n"


class Command(BaseCommand):
    help = "Exporte les metriques et tableaux comparatifs IA pour le rapport."

    def add_arguments(self, parser):
        parser.add_argument("--test-start", default="2024-01", help="Debut du jeu de test au format YYYY-MM.")
        parser.add_argument("--test-end", default=None, help="Fin du jeu de test au format YYYY-MM.")
        parser.add_argument(
            "--algo",
            action="append",
            default=None,
            help="Algorithme de regression a evaluer. Peut etre repete.",
        )
        parser.add_argument(
            "--output",
            default="reports/ia",
            help="Dossier de sortie, relatif a BASE_DIR si non absolu.",
        )
        parser.add_argument(
            "--prefix",
            default=None,
            help="Prefixe des fichiers. Defaut : metriques_ia_<timestamp>.",
        )
        parser.add_argument(
            "--format",
            choices=["all", "csv", "markdown", "json"],
            default="all",
            help="Format d'export.",
        )

    def handle(self, *args, **options):
        from ia_module.models import ModeleIA
        from ia_module.services.evaluation_modeles import EvaluationModeles

        rapport = EvaluationModeles().evaluer_rendement(
            algorithmes=options["algo"],
            test_start=options["test_start"],
            test_end=options["test_end"],
        )
        modeles_actifs = list(ModeleIA.objects.filter(actif=True).order_by("type_tache", "algorithme", "-id"))

        export = self._build_export(rapport, modeles_actifs)
        output_dir = self._output_dir(options["output"])
        output_dir.mkdir(parents=True, exist_ok=True)

        prefix = options["prefix"] or f"metriques_ia_{timezone.now().strftime('%Y%m%d_%H%M%S')}"
        paths = []
        fmt = options["format"]

        if fmt in ("all", "csv"):
            paths.extend(self._write_csv_files(output_dir, prefix, export))
        if fmt in ("all", "markdown"):
            paths.append(self._write_markdown(output_dir, prefix, export))
        if fmt in ("all", "json"):
            paths.append(self._write_json(output_dir, prefix, export))

        self.stdout.write(self.style.SUCCESS("Export metriques IA termine."))
        for path in paths:
            self.stdout.write(f"  {path}")

    def _output_dir(self, output):
        path = Path(output)
        if not path.is_absolute():
            path = Path(settings.BASE_DIR) / path
        return path

    def _build_export(self, rapport, modeles_actifs):
        comparaison = self._comparison_rows(rapport)
        actifs = self._active_model_rows(modeles_actifs)
        meilleur = rapport["meilleur"]
        importances = self._importance_rows(meilleur)
        points_mensuels = self._monthly_rows(meilleur)

        return {
            "resume": self._summary(rapport),
            "comparaison_backtesting": comparaison,
            "modeles_actifs": actifs,
            "importances_meilleur_modele": importances,
            "points_mensuels_meilleur_modele": points_mensuels,
            "rapport_brut": rapport,
        }

    def _summary(self, rapport):
        split = rapport["split"]
        data = rapport["periode_donnees"]
        meilleur = rapport["meilleur"]
        metriques = meilleur["metriques"]
        return {
            "periode_donnees": f"{data['debut']} -> {data['fin']}",
            "observations": data["observations"],
            "nb_secteurs": data["nb_secteurs"],
            "entrainement": f"{split['train_start']} -> {split['train_end']}",
            "observations_entrainement": split["train_observations"],
            "test": f"{split['test_start']} -> {split['test_end']}",
            "observations_test": split["test_observations"],
            "nb_features": rapport["nb_features"],
            "meilleur_modele": meilleur["algorithme"],
            "meilleur_r2": _round(metriques.get("r2"), 4),
            "meilleur_rmse": _round(metriques.get("rmse"), 2),
            "meilleur_mape_pct": _pct(metriques.get("mape"), 2),
            "niveau_fiabilite": metriques.get("niveau_fiabilite"),
        }

    def _comparison_rows(self, rapport):
        rows = []
        split = rapport["split"]
        for resultat in rapport["resultats"]:
            metriques = resultat["metriques"]
            rows.append({
                "Algorithme": resultat["algorithme"],
                "Nom": resultat["nom"],
                "Type": resultat["type_tache"],
                "Train": split["train_observations"],
                "Test": split["test_observations"],
                "RMSE": _round(metriques.get("rmse"), 2),
                "MAE": _round(metriques.get("mae"), 2),
                "R2": _round(metriques.get("r2"), 4),
                "MAPE (%)": _pct(metriques.get("mape"), 2),
                "Precision moyenne (%)": _pct(metriques.get("precision_moyenne_pct"), 2),
                "Fiabilite": metriques.get("niveau_fiabilite"),
                "Nb features": len(resultat.get("features") or []),
            })
        return rows

    def _active_model_rows(self, modeles):
        rows = []
        for modele in modeles:
            metriques = modele.metriques or {}
            rows.append({
                "ID": modele.id,
                "Nom": modele.nom,
                "Algorithme": modele.algorithme,
                "Type": modele.type_tache,
                "Version": modele.version,
                "Observations": modele.nb_observations,
                "R2 CV": _round(metriques.get("r2"), 4),
                "RMSE CV": _round(metriques.get("rmse"), 2),
                "MAE CV": _round(metriques.get("mae"), 2),
                "Accuracy": _round(metriques.get("accuracy"), 4),
                "Precision": _round(metriques.get("precision"), 4),
                "Recall": _round(metriques.get("recall"), 4),
                "F1": _round(metriques.get("f1"), 4),
                "Actif": "Oui" if modele.actif else "Non",
            })
        return rows

    def _importance_rows(self, meilleur):
        importances = meilleur.get("importances") or {}
        rows = []
        for feature, importance in sorted(importances.items(), key=lambda item: item[1], reverse=True):
            rows.append({
                "Rang": len(rows) + 1,
                "Variable": feature,
                "Importance": _round(importance, 6),
                "Importance (%)": _pct(float(importance) * 100, 2),
            })
        return rows

    def _monthly_rows(self, meilleur):
        rows = []
        for point in meilleur.get("points_mensuels") or []:
            rows.append({
                "Periode": point.get("periode"),
                "Reel": point.get("reel"),
                "Predit": point.get("predit"),
                "Erreur": point.get("erreur"),
                "Erreur (%)": point.get("erreur_pct"),
                "Observations": point.get("observations"),
            })
        return rows

    def _write_csv_files(self, output_dir, prefix, export):
        mapping = {
            "comparaison_backtesting": export["comparaison_backtesting"],
            "modeles_actifs": export["modeles_actifs"],
            "importances_meilleur_modele": export["importances_meilleur_modele"],
            "points_mensuels_meilleur_modele": export["points_mensuels_meilleur_modele"],
        }
        paths = []
        for name, rows in mapping.items():
            path = output_dir / f"{prefix}_{name}.csv"
            self._write_csv(path, rows)
            paths.append(path)
        return paths

    def _write_csv(self, path, rows):
        with path.open("w", newline="", encoding="utf-8-sig") as fh:
            if not rows:
                fh.write("")
                return
            writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    def _write_markdown(self, output_dir, prefix, export):
        path = output_dir / f"{prefix}_rapport.md"
        resume = export["resume"]
        lines = [
            "# Metriques du module IA",
            "",
            "## Resume",
            "",
            _markdown_table([resume]),
            "## Comparaison des modeles de prediction",
            "",
            _markdown_table(export["comparaison_backtesting"]),
            "## Modeles actifs",
            "",
            _markdown_table(export["modeles_actifs"]),
            "## Importance des variables du meilleur modele",
            "",
            _markdown_table(export["importances_meilleur_modele"]),
            "## Points mensuels reel vs predit",
            "",
            _markdown_table(export["points_mensuels_meilleur_modele"]),
        ]
        path.write_text("\n".join(lines), encoding="utf-8")
        return path

    def _write_json(self, output_dir, prefix, export):
        path = output_dir / f"{prefix}_rapport.json"
        path.write_text(json.dumps(export, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        return path
