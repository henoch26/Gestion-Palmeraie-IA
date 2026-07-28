from __future__ import annotations

import math
import unicodedata
from datetime import date

from django.db.models import Count, Sum

from .aide_decisionnelle import AideDecisionnelleIA


MOIS = [
    "",
    "Janvier",
    "Fevrier",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Aout",
    "Septembre",
    "Octobre",
    "Novembre",
    "Decembre",
]


def _float(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _round(value, digits=2):
    return round(_float(value), digits)


def _pct(value):
    return round(_float(value), 1)


def _clamp(value, minimum=0, maximum=100):
    return max(minimum, min(maximum, value))


def _normalize(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower().strip()


def _next_month(year, month):
    if month >= 12:
        return year + 1, 1
    return year, month + 1


class FonctionnalitesIAAvancees:
    """Fonctions decisionnelles conservees pour le centre IA.

    Cette classe reste volontairement limitee aux outils directement utilises
    par l'interface principale : tendances, scoring recolteurs et assistant
    metier. Les experimentations non exposees ont ete retirees pour garder une
    base plus simple a expliquer et a maintenir.
    """

    def __init__(self, user=None):
        self.user = user
        self.decision = AideDecisionnelleIA(user)

    def tendances(self, year=None, month=None, horizon=6, secteur_id=None):
        from secteurs.models import Secteur

        today = date.today()
        target_year = _int(year, today.year)
        target_month = _int(month, today.month)
        horizon = _clamp(_int(horizon, 6), 3, 6)

        secteurs = Secteur.objects.all().order_by("code")
        if secteur_id:
            secteurs = secteurs.filter(pk=secteur_id)

        rows = []
        for secteur in secteurs:
            y, m = target_year, target_month
            points = []
            previous = None
            for _ in range(int(horizon)):
                valeur = self.decision._baseline_prediction(secteur, y, m)
                objectif = self.decision._objectif_mensuel(secteur, m)
                ecart = ((valeur - objectif) / objectif * 100) if objectif else 0
                variation = ((valeur - previous) / previous * 100) if previous else 0
                points.append({
                    "annee": y,
                    "mois": m,
                    "mois_label": MOIS[m],
                    "valeur_predite": _round(valeur),
                    "objectif_regimes": _round(objectif),
                    "ecart_objectif_pct": _pct(ecart),
                    "variation_pct": _pct(variation),
                    "niveau": self._niveau_tendance(ecart, variation),
                })
                previous = valeur
                y, m = _next_month(y, m)

            start = points[0]["valeur_predite"] if points else 0
            end = points[-1]["valeur_predite"] if points else 0
            variation_globale = ((end - start) / start * 100) if start else 0
            rows.append({
                "secteur": {"id": secteur.id, "code": secteur.code, "nom": secteur.nom},
                "horizon_mois": int(horizon),
                "variation_globale_pct": _pct(variation_globale),
                "lecture": self._lecture_tendance(variation_globale),
                "points": points,
            })

        return {
            "annee_depart": target_year,
            "mois_depart": target_month,
            "horizon_mois": int(horizon),
            "total": len(rows),
            "tendances": rows,
        }

    def assistant_metier(self, question, year=None):
        q = _normalize(question)
        if not q:
            return {
                "reponse": "Posez une question metier sur les secteurs, recolteurs, anomalies ou previsions.",
                "donnees": None,
                "actions": [],
            }

        if "pourquoi" in q and "secteur" in q:
            secteur = self._find_secteur_in_question(q)
            if secteur:
                analyse = self.decision.analyser_secteur(secteur, year=year)
                facteurs = analyse.get("facteurs_risque", [])[:3]
                raisons = ", ".join(f["label"] for f in facteurs) if facteurs else "aucun facteur critique net"
                return {
                    "reponse": f"Le secteur {secteur.code} est explique par: {raisons}.",
                    "donnees": analyse,
                    "actions": [analyse.get("action_recommandee")],
                }

        if any(word in q for word in ["faible", "faibles", "risque", "baisse", "prioritaire", "critique"]):
            rows = self.decision.scores_secteurs(year=year, limit=5)
            codes = ", ".join(row["code"] for row in rows[:3]) or "aucun"
            return {
                "reponse": f"Secteurs les plus sensibles: {codes}.",
                "donnees": rows,
                "actions": [row["action_recommandee"] for row in rows[:3]],
            }

        if "recolteur" in q or "personnel" in q or "meilleur" in q:
            rows = self.scoring_recolteurs(year=year, limit=5)["recolteurs"]
            top = rows[0]["nom"] if rows else "aucun recolteur"
            return {
                "reponse": f"Le meilleur score actuel est: {top}.",
                "donnees": rows,
                "actions": ["Verifier les anomalies individuelles avant decision."],
            }

        if "prevision" in q or "prochain" in q or "tendance" in q:
            data = self.tendances(year=year, horizon=3)
            first = data["tendances"][0] if data["tendances"] else None
            if first and first["points"]:
                point = first["points"][0]
                return {
                    "reponse": f"Premiere tendance disponible: {first['secteur']['code']} avec {point['valeur_predite']} regimes prevus en {point['mois_label']} {point['annee']}.",
                    "donnees": data,
                    "actions": ["Comparer cette tendance aux objectifs et aux recoltes validees."],
                }

        rows = self.decision.scores_secteurs(year=year, limit=3)
        return {
            "reponse": "Je peux repondre sur les secteurs faibles, les causes de baisse, les recolteurs et les previsions.",
            "donnees": rows,
            "actions": ["Essayez: Quels secteurs sont critiques ?", "Essayez: Quels sont les meilleurs recolteurs ?"],
        }

    def scoring_recolteurs(self, year=None, month=None, limit=20):
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolteDetail

        today = date.today()
        target_year = _int(year, today.year)
        target_month = _int(month, None)
        limit = int(_clamp(_int(limit, 20), 1, 100))

        qs = FicheRecolteDetail.objects.filter(
            ligne__fiche__statut="valide",
            ligne__fiche__date__year=target_year,
            ligne__recolteur__isnull=False,
        )
        if target_month:
            qs = qs.filter(ligne__fiche__date__month=target_month)

        rows = qs.values("ligne__recolteur_id", "ligne__recolteur__nom").annotate(
            total=Sum("quantite"),
            fiches=Count("ligne__fiche_id", distinct=True),
        )
        max_total = max([_float(r["total"]) for r in rows] or [1])
        result = []
        for row in rows:
            recolteur_id = row["ligne__recolteur_id"]
            monthly = qs.filter(ligne__recolteur_id=recolteur_id).values("ligne__fiche__date__month").annotate(total=Sum("quantite"))
            values = [_float(m["total"]) for m in monthly if _float(m["total"]) > 0]
            avg = sum(values) / len(values) if values else 0
            variance = sum((v - avg) ** 2 for v in values) / len(values) if values else 0
            cv = math.sqrt(variance) / avg if avg else 0
            regularite = _clamp(100 - cv * 100)
            anomalies = Anomalie.objects.filter(recolteur_id=recolteur_id, statut="nouvelle").count()
            productivite = _float(row["total"]) / max(_float(row["fiches"]), 1)
            score = _clamp((_float(row["total"]) / max_total * 55) + (regularite * 0.35) - anomalies * 8 + 10)
            result.append({
                "recolteur_id": recolteur_id,
                "nom": row["ligne__recolteur__nom"] or "Sans nom",
                "score": _round(score, 1),
                "niveau": self._niveau_score(score),
                "total_regimes": int(_float(row["total"])),
                "nb_fiches": int(row["fiches"] or 0),
                "productivite_par_fiche": _round(productivite, 1),
                "regularite_pct": _round(regularite, 1),
                "anomalies_ouvertes": anomalies,
                "lecture": self._lecture_recolteur(score, anomalies),
            })

        result = sorted(result, key=lambda item: item["score"], reverse=True)[:limit]
        return {"annee": target_year, "mois": target_month, "total": len(result), "recolteurs": result}

    def _find_secteur_in_question(self, q):
        from secteurs.models import Secteur

        for secteur in Secteur.objects.all():
            if _normalize(secteur.code) in q or _normalize(secteur.nom) in q:
                return secteur
        return None

    def _niveau_score(self, score):
        score = _float(score)
        if score >= 70:
            return "critique"
        if score >= 40:
            return "eleve"
        if score >= 20:
            return "moyen"
        return "faible"

    def _niveau_tendance(self, ecart, variation):
        if ecart < -20 or variation < -15:
            return "critique"
        if ecart < -8 or variation < -6:
            return "alerte"
        return "normal"

    def _lecture_tendance(self, variation):
        if variation > 8:
            return "Tendance haussiere sur l'horizon."
        if variation < -8:
            return "Tendance baissiere a surveiller."
        return "Tendance globalement stable."

    def _lecture_recolteur(self, score, anomalies):
        if anomalies:
            return "Performance a verifier: anomalie ouverte."
        if score >= 75:
            return "Performance forte et reguliere."
        if score >= 45:
            return "Performance correcte a consolider."
        return "Performance faible ou irreguliere."