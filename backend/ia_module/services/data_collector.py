"""
services/data_collector.py — Collecte les données réelles de la base pour l'entraînement ML.

DataCollector rassemble les données de récolte, secteurs, récolteurs et météo
et les structure en DataFrame prêt pour le pipeline ML.
"""
import logging
from datetime import date

import numpy as np

logger = logging.getLogger(__name__)


class DataCollector:
    """Collecte et structure les données pour l'entraînement des modèles ML."""

    def collect_rendement_data(self):
        """
        Retourne une liste de dicts représentant les observations pour la
        prédiction de rendement (régression).

        Colonnes produites :
          annee, mois, secteur_id, superficie_ha, age_moyen_plants, nb_palmiers,
          rendement_cible, quantite_totale (cible), temperature_moy,
          precipitation_mm, humidite_pct
        """
        from recoltes.models import FicheRecolteDetail
        from ia_module.models import DonneeMeteo
        from django.db.models import Sum, Avg

        rows = []
        from .variables_agronomiques import VariablesAgronomiquesService
        variables_agro = VariablesAgronomiquesService()
        qs = (
            FicheRecolteDetail.objects
            .filter(ligne__fiche__statut="valide")
            .select_related("ligne__fiche", "secteur")
            .values(
                "ligne__fiche__date__year",
                "ligne__fiche__date__month",
                "secteur_id",
                "secteur__superficie_ha",
                "secteur__age_moyen_plants",
                "secteur__nb_palmiers",
                "secteur__rendement_cible_t_ha",
            )
            .annotate(quantite_totale=Sum("quantite"))
            .order_by("ligne__fiche__date__year", "ligne__fiche__date__month")
        )

        for row in qs:
            annee = row["ligne__fiche__date__year"]
            mois  = row["ligne__fiche__date__month"]
            sid   = row["secteur_id"]

            meteo = DonneeMeteo.objects.filter(
                secteur_id=sid,
                date__year=annee,
                date__month=mois,
            ).aggregate(
                temp_moy=Avg("temperature_moy"),
                precip=Avg("precipitation_mm"),
                humid=Avg("humidite_pct"),
            )

            age_moyen = float(row["secteur__age_moyen_plants"] or 10)
            variables = variables_agro.features_pour_secteur_id(
                sid,
                annee,
                mois,
                age_moyen_plants=age_moyen,
            )
            rows.append({
                "annee":            annee,
                "mois":             mois,
                "secteur_id":       sid or 0,
                "superficie_ha":    float(row["secteur__superficie_ha"] or 0),
                "age_moyen_plants": age_moyen,
                "nb_palmiers":      float(row["secteur__nb_palmiers"] or 100),
                "rendement_cible":  float(row["secteur__rendement_cible_t_ha"] or 15),
                "temperature_moy":  float(meteo["temp_moy"] or 27),
                "precipitation_mm": float(meteo["precip"] or 100),
                "humidite_pct":     float(meteo["humid"] or 75),
                "quantite_totale":  float(row["quantite_totale"] or 0),
                **variables,
            })

        logger.info("DataCollector: %d observations rendement collectées", len(rows))
        return rows

    def collect_recolteur_data(self):
        """
        Retourne les performances par récolteur par mois pour la détection
        d'anomalies sur les récolteurs.
        """
        from recoltes.models import FicheRecolteDetail
        from django.db.models import Sum

        rows = []
        qs = (
            FicheRecolteDetail.objects
            .filter(ligne__fiche__statut="valide")
            .values(
                "ligne__fiche__date__year",
                "ligne__fiche__date__month",
                "ligne__recolteur_id",
                "ligne__recolteur__nom",
            )
            .annotate(quantite_totale=Sum("quantite"))
            .order_by("ligne__fiche__date__year", "ligne__fiche__date__month")
        )

        for row in qs:
            if not row["ligne__recolteur_id"]:
                continue
            rows.append({
                "annee":          row["ligne__fiche__date__year"],
                "mois":           row["ligne__fiche__date__month"],
                "recolteur_id":   row["ligne__recolteur_id"],
                "recolteur_nom":  row["ligne__recolteur__nom"] or "",
                "quantite_totale": float(row["quantite_totale"] or 0),
            })

        return rows

    def collect_anomalie_labels(self):
        """
        Construit un dataset labelisé pour les modèles supervisés de détection
        d'anomalies. Label 1 = anomalie, 0 = normal.

        La référence de comparaison est la distribution du secteur pour CE MÊME
        MOIS, calculée sur les années PROCHES (fenêtre de +/- 2 ans), et non sur :
          - la moyenne annuelle toutes saisons confondues (un secteur produit
            mécaniquement plus en haute saison qu'en basse saison) ;
          - la moyenne du même mois sur TOUTE la période 2014-2026 (les palmiers
            grandissent : les toutes premières et les plus récentes années
            s'écartent alors fortement de la moyenne globale à cause de la seule
            maturation des plants, pas d'un incident réel — vérifié empiriquement :
            2014 donnait ~88% d'anomalies et 2025 ~77%, contre ~55-65% au milieu
            de la période, signe clair d'un effet de tendance et non d'un signal).

        Le critère d'écart lui-même est basé sur l'IQR (écart interquartile,
        convention de Tukey : anomalie si |valeur - médiane| > 3 x IQR), et non
        sur un pourcentage fixe de la moyenne : la distribution des quantités
        récoltées est nettement asymétrique (skewness ≈ 1,7), ce qui rend une
        comparaison à la moyenne peu fiable, et un pourcentage fixe (30% vs
        moyenne) donnait ~61% d'anomalies vu le bruit réel des données — bien
        au-delà de ce qui est exploitable. Identique à `DetecteurAnomalies.
        _regle_ecart_secteur`, pour que le label appris par les modèles
        supervisés corresponde à la même définition que la règle métier
        appliquée en production.
        """
        rows = self.collect_rendement_data()
        if not rows:
            return []

        FENETRE_ANNEES = 2
        SEUIL_IQR = 3.0

        secteur_all = {}
        for r in rows:
            secteur_all.setdefault(r["secteur_id"], []).append(r["quantite_totale"])

        secteur_mois_groups = {}
        for r in rows:
            secteur_mois_groups.setdefault((r["secteur_id"], r["mois"]), []).append(r)

        feedback_labels = self._feedback_anomalies_validees()
        labeled = []
        for r in rows:
            group = secteur_mois_groups[(r["secteur_id"], r["mois"])]
            voisins = [
                g["quantite_totale"] for g in group
                if g is not r and abs(g["annee"] - r["annee"]) <= FENETRE_ANNEES
            ]
            reference = voisins if len(voisins) >= 3 else secteur_all.get(r["secteur_id"], [])
            if len(reference) < 3:
                labeled.append(self._apply_feedback_label({**r, "is_anomaly": 0, "ecart_pct": 0.0}, feedback_labels))
                continue

            mediane = float(np.median(reference))
            q1, q3 = np.percentile(reference, 25), np.percentile(reference, 75)
            iqr = max(float(q3 - q1), 1.0)

            score_iqr = abs(r["quantite_totale"] - mediane) / iqr
            is_anomaly = 1 if score_iqr > SEUIL_IQR else 0
            ecart_pct = abs(r["quantite_totale"] - mediane) / max(mediane, 1) * 100
            labeled.append(self._apply_feedback_label({**r, "is_anomaly": is_anomaly, "ecart_pct": ecart_pct}, feedback_labels))

        return labeled

    def _feedback_anomalies_validees(self):
        """Retourne les decisions humaines utilisables comme labels supervises."""
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolteDetail

        feedback = {}
        qs = Anomalie.objects.filter(statut__in=("validee", "rejetee"))
        for anomalie in qs:
            details = anomalie.details or {}
            event = details.get("feedback_humain") or {}
            label = event.get("label_apprentissage")
            if label is None:
                label = 1 if anomalie.statut == "validee" else 0

            annee = details.get("annee")
            mois = details.get("mois")
            secteur_id = anomalie.secteur_id or details.get("secteur_id")

            if anomalie.fiche_recolte_id and (not annee or not mois):
                annee = anomalie.fiche_recolte.date.year
                mois = anomalie.fiche_recolte.date.month

            if anomalie.fiche_recolte_id and not secteur_id:
                secteur_ids = (
                    FicheRecolteDetail.objects
                    .filter(ligne__fiche_id=anomalie.fiche_recolte_id, secteur__isnull=False)
                    .values_list("secteur_id", flat=True)
                    .distinct()
                )
                for sid in secteur_ids:
                    if annee and mois:
                        feedback[(int(sid), int(annee), int(mois))] = int(label)
                continue

            if secteur_id and annee and mois:
                feedback[(int(secteur_id), int(annee), int(mois))] = int(label)
        return feedback

    def _apply_feedback_label(self, row, feedback_labels):
        key = (int(row.get("secteur_id") or 0), int(row.get("annee") or 0), int(row.get("mois") or 0))
        if key in feedback_labels:
            row = dict(row)
            row["is_anomaly"] = feedback_labels[key]
            row["label_source"] = "validation_humaine"
        return row
