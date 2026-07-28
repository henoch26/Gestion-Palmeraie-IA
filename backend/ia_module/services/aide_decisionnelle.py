from __future__ import annotations

from datetime import date
from math import ceil

from django.db.models import Avg, Q, Sum


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


FEATURE_LABELS = {
    "annee": "Annee cible",
    "mois": "Mois cible",
    "secteur_id": "Secteur",
    "superficie_ha": "Superficie",
    "age_moyen_plants": "Age moyen des plants",
    "nb_palmiers": "Nombre de palmiers",
    "rendement_cible": "Rendement cible",
    "temperature_moy": "Temperature moyenne",
    "precipitation_mm": "Pluviometrie",
    "humidite_pct": "Humidite",
}


def _float(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def _round(value, digits=2):
    return round(_float(value), digits)


class AideDecisionnelleIA:
    """
    Calcule des signaux IA directement lisibles par les utilisateurs :
    risque secteur, explication de prediction et planification d'equipe.
    """

    def __init__(self, user=None):
        self.user = user
        self.role = self._get_role()

    def _get_role(self):
        try:
            return self.user.profile.role
        except AttributeError:
            return "superviseur"

    @property
    def limit_to_owner(self):
        return self.role in ("superviseur", "superviseur_adjoint")

    def scores_secteurs(self, year=None, limit=None):
        from secteurs.models import Secteur

        target_year = int(year or date.today().year)
        rows = [
            self.analyser_secteur(secteur, target_year)
            for secteur in Secteur.objects.all().order_by("code")
        ]
        rows = sorted(rows, key=lambda item: item["score_risque"], reverse=True)
        if limit:
            return rows[: int(limit)]
        return rows

    def resume_risque(self, rows):
        critiques = [row for row in rows if row["niveau"] in ("critique", "eleve")]
        score_moyen = sum(row["score_risque"] for row in rows) / len(rows) if rows else 0
        return {
            "score_moyen": _round(score_moyen, 1),
            "secteurs_a_traiter": len(critiques),
            "niveau_global": self._niveau_risque(score_moyen),
            "lecture": (
                "Surveillance prioritaire recommandee."
                if critiques else
                "Situation globalement stable."
            ),
        }

    def analyser_secteur(self, secteur, year=None, month=None):
        target_year = int(year or date.today().year)
        target_month = int(month or date.today().month)

        production = self._production(secteur, target_year)
        previous = self._production(secteur, target_year - 1)
        production_mois = self._production(secteur, target_year, target_month)
        moyenne_mois = self._historical_month_average(secteur, target_month, exclude_year=target_year)
        anomalies = self._anomalies(secteur)
        meteo = self._meteo_context(secteur, target_year, target_month)

        superficie = _float(secteur.superficie_ha)
        rendement = production / superficie if superficie else 0
        objectif_annuel = self._objectif_annuel(secteur)
        objectif_attendu = self._objectif_attendu_a_date(secteur, target_year)
        progression_objectif = production / objectif_attendu * 100 if objectif_attendu else 0
        baisse_pct = (previous - production) / previous * 100 if previous else 0
        tendance_mois_pct = (
            (moyenne_mois - production_mois) / moyenne_mois * 100
            if moyenne_mois else 0
        )

        score, facteurs = self._facteurs_risque(
            secteur=secteur,
            production=production,
            previous=previous,
            objectif_attendu=objectif_attendu,
            production_mois=production_mois,
            moyenne_mois=moyenne_mois,
            anomalies=anomalies,
            meteo=meteo,
        )

        plan = self.planifier_equipe(
            secteur=secteur,
            year=target_year,
            month=target_month,
            objectif_regimes=max(
                self._objectif_mensuel(secteur, target_month),
                self._baseline_prediction(secteur, target_year, target_month),
            ),
        )

        return {
            "id": secteur.id,
            "code": secteur.code,
            "nom": secteur.nom,
            "score_risque": score,
            "niveau": self._niveau_risque(score),
            "production_regimes": int(production),
            "production_precedente": int(previous),
            "production_mois": int(production_mois),
            "moyenne_mois": _round(moyenne_mois),
            "baisse_pct": _round(max(0, baisse_pct), 1),
            "tendance_mois_pct": _round(max(0, tendance_mois_pct), 1),
            "rendement_reg_ha": _round(rendement),
            "objectif_regimes": _round(objectif_annuel),
            "objectif_attendu": _round(objectif_attendu),
            "progression_objectif_pct": _round(progression_objectif, 1),
            "anomalies_ouvertes": anomalies["total"],
            "anomalies_critiques": anomalies["critiques"],
            "facteurs_risque": facteurs,
            "motif": self._motif(facteurs),
            "action_recommandee": self._action_secteur(score),
            "plan_equipe": plan,
            "meteo": meteo,
        }

    def planifier_equipe(self, secteur, year=None, month=None, objectif_regimes=None):
        target_year = int(year or date.today().year)
        target_month = int(month or date.today().month)
        reference = self._baseline_prediction(secteur, target_year, target_month)
        objectif = _float(objectif_regimes) or reference or self._objectif_mensuel(secteur, target_month)
        productivite = max(20.0, self._productivite_par_recolteur(secteur))

        passages = 2
        if objectif >= 1600:
            passages = 4
        elif objectif >= 900:
            passages = 3

        charge_theorique = objectif / max(productivite * passages, 1)
        nb_recolteurs = int(_clamp(ceil(charge_theorique), 2, 45))
        charge_par_recolteur = objectif / max(nb_recolteurs * passages, 1)
        capacite = nb_recolteurs * productivite * passages
        marge = (capacite - objectif) / objectif * 100 if objectif else 0

        effort = "normal"
        heures = 7.0
        cycle = 15
        if marge < 10:
            effort = "renforce"
            heures = 8.0
            cycle = 10
        elif objectif > reference * 1.2:
            effort = "soutenu"
            heures = 7.5
            cycle = 12

        actions = [
            f"Mobiliser {nb_recolteurs} recolteurs sur {passages} passage(s).",
            f"Visez environ {round(charge_par_recolteur)} regimes par recolteur et par passage.",
        ]
        if cycle <= 10:
            actions.append("Raccourcir le cycle de passage pour limiter les pertes de regimes murs.")
        if marge < 0:
            actions.append("Prevoir une equipe de renfort ou reviser l'objectif.")

        return {
            "periode": {
                "annee": target_year,
                "mois": target_month,
                "mois_label": MOIS[target_month],
            },
            "objectif_regimes": _round(objectif),
            "reference_regimes": _round(reference),
            "productivite_moyenne": _round(productivite),
            "nb_recolteurs": nb_recolteurs,
            "nb_fiches": passages,
            "nb_heures": heures,
            "frequence_cycle_jours": cycle,
            "capacite_estimee": _round(capacite),
            "marge_capacite_pct": _round(marge, 1),
            "charge_par_recolteur": _round(charge_par_recolteur, 1),
            "niveau_effort": effort,
            "lecture": self._lecture_plan(marge, objectif, reference),
            "actions": actions,
        }

    def expliquer_prediction(self, prediction):
        valeur = _float(prediction.valeur_predite)
        intervalle_bas = _float(prediction.intervalle_bas)
        intervalle_haut = _float(prediction.intervalle_haut)
        incertitude_pct = (
            (intervalle_haut - intervalle_bas) / valeur * 100
            if valeur and intervalle_haut and intervalle_bas else 0
        )
        niveau_confiance = self._niveau_confiance(incertitude_pct)

        features = prediction.features_utilisees or {}
        importances = {}
        if prediction.modele:
            importances = prediction.modele.metriques.get("importances") or {}

        facteurs = self._facteurs_prediction(features, importances)
        objectif_mensuel = 0
        if prediction.secteur:
            objectif_mensuel = self._objectif_mensuel(prediction.secteur, prediction.mois_cible or date.today().month)

        ecart_objectif_pct = (
            (valeur - objectif_mensuel) / objectif_mensuel * 100
            if objectif_mensuel else 0
        )

        actions = []
        if incertitude_pct > 50:
            actions.append("Renforcer les donnees historiques du secteur pour reduire l'incertitude.")
        if objectif_mensuel and valeur < objectif_mensuel * 0.85:
            actions.append("Planifier un controle terrain avant le prochain passage.")

        contexte_agronomique = self._contexte_agronomique_prediction(
            features.get("contexte_agronomique")
        )
        for alerte in (contexte_agronomique or {}).get("alertes", [])[:3]:
            action = alerte.get("action")
            if action and action not in actions:
                actions.append(action)

        if not actions:
            actions.append("Utiliser cette estimation comme base de planification.")

        return {
            "prediction_id": prediction.id,
            "valeur_predite": _round(valeur),
            "niveau_confiance": niveau_confiance,
            "incertitude_pct": _round(incertitude_pct, 1),
            "comparaison_objectif": {
                "objectif_mensuel": _round(objectif_mensuel),
                "ecart_pct": _round(ecart_objectif_pct, 1),
                "lecture": self._lecture_objectif(valeur, objectif_mensuel),
            },
            "facteurs": facteurs,
            "resume": self._resume_prediction(valeur, objectif_mensuel, niveau_confiance),
            "contexte_agronomique": contexte_agronomique,
            "actions": actions,
        }

    def _contexte_agronomique_prediction(self, contexte):
        if not isinstance(contexte, dict) or not contexte:
            return None

        indicateurs = contexte.get("indicateurs") or {}
        scores = contexte.get("scores") or {}
        score = scores.get("confiance_contexte")
        if score is None:
            score = contexte.get("score_confiance_moyen")

        return {
            "scope": contexte.get("scope", "secteur"),
            "lecture": contexte.get("lecture"),
            "score_confiance": score,
            "origine": contexte.get("origine"),
            "indicateurs": indicateurs,
            "alertes": (contexte.get("alertes") or [])[:5],
            "donnees_manquantes": (contexte.get("donnees_manquantes") or [])[:8],
            "secteurs_a_surveiller": (contexte.get("secteurs_a_surveiller") or [])[:8],
        }

    def _facteurs_risque(
        self,
        secteur,
        production,
        previous,
        objectif_attendu,
        production_mois,
        moyenne_mois,
        anomalies,
        meteo,
    ):
        score = 0.0
        facteurs = []

        def ajouter(code, label, points, detail, action):
            nonlocal score
            points = _clamp(_float(points), 0, 100)
            if points <= 0:
                return
            score += points
            facteurs.append({
                "code": code,
                "label": label,
                "impact": _round(points, 1),
                "detail": detail,
                "action": action,
            })

        anomalies_points = min(35, anomalies["total"] * 10 + anomalies["critiques"] * 8)
        ajouter(
            "anomalies",
            "Alertes ouvertes",
            anomalies_points,
            f"{anomalies['total']} alerte(s), dont {anomalies['critiques']} importante(s).",
            "Verifier les fiches et traiter les alertes prioritaires.",
        )

        if previous and production < previous * 0.8:
            baisse_pct = (previous - production) / previous * 100
            ajouter(
                "baisse_annuelle",
                "Baisse de production",
                min(25, 8 + (baisse_pct - 20) * 0.7),
                f"Production en baisse de {baisse_pct:.1f}% par rapport a l'annee precedente.",
                "Comparer les causes : meteo, entretien, maturite et organisation des passages.",
            )

        if objectif_attendu and production < objectif_attendu * 0.65:
            ecart_pct = (1 - production / objectif_attendu) * 100
            ajouter(
                "objectif",
                "Retard sur objectif",
                min(25, 8 + ecart_pct * 0.25),
                f"Seulement {max(0, 100 - ecart_pct):.1f}% de l'objectif attendu est couvert.",
                "Revoir l'objectif mensuel et renforcer le suivi du secteur.",
            )

        if moyenne_mois and production_mois < moyenne_mois * 0.8:
            baisse_mois = (moyenne_mois - production_mois) / moyenne_mois * 100
            ajouter(
                "tendance_mensuelle",
                "Mois sous la moyenne",
                min(18, 6 + baisse_mois * 0.35),
                f"Le mois courant est {baisse_mois:.1f}% sous la moyenne historique.",
                "Accelerer le diagnostic du mois avant validation des prochains chiffres.",
            )

        champs_manquants = []
        if not secteur.rendement_cible_t_ha:
            champs_manquants.append("rendement cible")
        if not secteur.age_moyen_plants:
            champs_manquants.append("age des plants")
        if not secteur.nb_palmiers:
            champs_manquants.append("nombre de palmiers")
        if meteo["nb_jours"] == 0:
            champs_manquants.append("meteo")
        ajouter(
            "qualite_donnees",
            "Donnees incompletes",
            min(12, len(champs_manquants) * 4),
            "Champs a completer : " + ", ".join(champs_manquants) + ".",
            "Completer les parametres du secteur pour fiabiliser l'analyse.",
        )

        if meteo["precipitation_mm"] and (meteo["precipitation_mm"] < 45 or meteo["precipitation_mm"] > 260):
            ajouter(
                "meteo",
                "Pluviometrie atypique",
                6,
                f"Pluviometrie moyenne : {meteo['precipitation_mm']:.1f} mm.",
                "Surveiller l'impact sur l'accessibilite, la maturite et les pertes.",
            )
        if meteo["temperature_moy"] and meteo["temperature_moy"] > 33:
            ajouter(
                "temperature",
                "Temperature elevee",
                4,
                f"Temperature moyenne : {meteo['temperature_moy']:.1f} degres.",
                "Adapter les horaires et surveiller le stress hydrique.",
            )

        age_plants = _float(secteur.age_moyen_plants)
        if age_plants > 25:
            ajouter(
                "age_plants",
                "Plants vieillissants",
                6,
                f"Age moyen estime a {age_plants:.0f} ans.",
                "Planifier un controle agronomique et anticiper le renouvellement.",
            )

        if _float(secteur.nb_palmiers) and _float(secteur.superficie_ha):
            densite = _float(secteur.nb_palmiers) / max(_float(secteur.superficie_ha), 1)
            if densite < 90:
                ajouter(
                    "densite",
                    "Densite faible",
                    5,
                    f"Densite estimee a {densite:.0f} palmiers/ha.",
                    "Verifier les manquants et l'occupation reelle de la parcelle.",
                )

        return min(100, round(score)), sorted(facteurs, key=lambda item: item["impact"], reverse=True)

    def _facteurs_prediction(self, features, importances):
        if not importances:
            importances = {
                "rendement_cible": 0.24,
                "superficie_ha": 0.18,
                "nb_palmiers": 0.16,
                "age_moyen_plants": 0.14,
                "precipitation_mm": 0.12,
                "temperature_moy": 0.09,
                "humidite_pct": 0.07,
            }

        facteurs = []
        for feature, importance in sorted(importances.items(), key=lambda item: item[1], reverse=True)[:6]:
            valeur = features.get(feature)
            facteurs.append({
                "feature": feature,
                "label": FEATURE_LABELS.get(feature, feature),
                "importance_pct": _round(_float(importance) * 100, 1),
                "valeur": valeur,
                "lecture": self._lecture_feature(feature, valeur),
            })
        return facteurs

    def _production(self, secteur, year, month=None):
        details = self._details(year=year, secteur=secteur)
        if month:
            details = details.filter(ligne__fiche__date__month=month)
        return _float(details.aggregate(total=Sum("quantite"))["total"])

    def _details(self, year=None, secteur=None):
        from recoltes.models import FicheRecolteDetail

        details = FicheRecolteDetail.objects.filter(ligne__fiche__statut="valide")
        if year:
            details = details.filter(ligne__fiche__date__year=year)
        if secteur:
            details = details.filter(secteur=secteur)
        if self.limit_to_owner and self.user:
            details = details.filter(ligne__fiche__created_by=self.user)
        return details

    def _anomalies(self, secteur):
        from ia_module.models import Anomalie

        anomalies = Anomalie.objects.filter(statut="nouvelle").filter(
            Q(secteur=secteur) | Q(fiche_recolte__lignes__details__secteur=secteur)
        ).distinct()
        if self.limit_to_owner and self.user:
            anomalies = anomalies.filter(Q(fiche_recolte__created_by=self.user) | Q(fiche_recolte__isnull=True))
        return {
            "total": anomalies.count(),
            "critiques": anomalies.filter(criticite__in=("critique", "elevee")).count(),
        }

    def _historical_month_average(self, secteur, month, exclude_year=None):
        details = self._details(secteur=secteur).filter(ligne__fiche__date__month=month)
        if exclude_year:
            details = details.exclude(ligne__fiche__date__year=exclude_year)
        rows = details.values("ligne__fiche__date__year").annotate(total=Sum("quantite"))
        values = [_float(row["total"]) for row in rows if _float(row["total"]) > 0]
        return sum(values) / len(values) if values else 0

    def _baseline_prediction(self, secteur, year, month):
        from ia_module.models import Prediction

        prediction = (
            Prediction.objects.filter(secteur=secteur, annee_cible=year, mois_cible=month)
            .order_by("-date_prediction")
            .first()
        )
        if prediction:
            return _float(prediction.valeur_predite)

        monthly_average = self._historical_month_average(secteur, month)
        if monthly_average:
            return monthly_average

        all_rows = self._details(secteur=secteur).values(
            "ligne__fiche__date__year",
            "ligne__fiche__date__month",
        ).annotate(total=Sum("quantite"))
        values = [_float(row["total"]) for row in all_rows if _float(row["total"]) > 0]
        if values:
            return sum(values) / len(values)

        return self._objectif_mensuel(secteur, month) or 500.0

    def _productivite_par_recolteur(self, secteur=None):
        """
        Productivité moyenne par récolteur et par fiche, calculée POUR LE
        SECTEUR CONCERNÉ si fourni — pas tous secteurs confondus. Un récolteur
        peut travailler sur plusieurs secteurs dans une même fiche ; mélanger
        tout surestime fortement ce qu'il produit dans un seul secteur donné
        (vérifié empiriquement : la moyenne globale, 63,5, était 2 à 7 fois
        plus élevée que la productivité réelle de n'importe quel secteur pris
        seul — 9 à 26,5 selon le secteur). Repli sur la moyenne globale si le
        secteur manque d'historique récolteur (< 3 observations).
        """
        def _moyenne(qs):
            rows = (
                qs.filter(ligne__recolteur__isnull=False)
                .values("ligne__fiche_id", "ligne__recolteur_id")
                .annotate(total=Sum("quantite"))
            )
            values = [_float(row["total"]) for row in rows if _float(row["total"]) > 0]
            return (sum(values) / len(values)) if len(values) >= 3 else None

        if secteur is not None:
            moyenne_secteur = _moyenne(self._details(secteur=secteur))
            if moyenne_secteur is not None:
                return moyenne_secteur

        moyenne_globale = _moyenne(self._details())
        return moyenne_globale if moyenne_globale is not None else 80.0

    def _meteo_context(self, secteur, year, month):
        from ia_module.models import DonneeMeteo

        meteo = DonneeMeteo.objects.filter(secteur=secteur, date__year=year, date__month=month)
        data = meteo.aggregate(
            temperature=Avg("temperature_moy"),
            precipitation=Avg("precipitation_mm"),
            humidite=Avg("humidite_pct"),
        )
        return {
            "nb_jours": meteo.count(),
            "temperature_moy": _round(data["temperature"], 1),
            "precipitation_mm": _round(data["precipitation"], 1),
            "humidite_pct": _round(data["humidite"], 1),
        }

    def _objectif_annuel(self, secteur):
        superficie = _float(secteur.superficie_ha)
        cible = _float(secteur.rendement_cible_t_ha)
        if superficie and cible:
            return superficie * cible * 10
        if superficie:
            return superficie * 120
        return 500.0

    def _objectif_mensuel(self, secteur, month):
        return self._objectif_annuel(secteur) / 12 * self._facteur_saisonnier(month)

    def _objectif_attendu_a_date(self, secteur, year):
        today = date.today()
        if year < today.year:
            mois_couverts = 12
        elif year > today.year:
            mois_couverts = 1
        else:
            mois_couverts = today.month
        return self._objectif_annuel(secteur) * mois_couverts / 12

    def _facteur_saisonnier(self, month):
        if month in (5, 6, 7, 8):
            return 1.08
        if month in (12, 1, 2):
            return 0.94
        return 1.0

    def _niveau_risque(self, score):
        if score >= 70:
            return "critique"
        if score >= 45:
            return "eleve"
        if score >= 20:
            return "moyen"
        return "faible"

    def _niveau_confiance(self, incertitude_pct):
        if incertitude_pct <= 25:
            return "elevee"
        if incertitude_pct <= 50:
            return "moyenne"
        return "faible"

    def _motif(self, facteurs):
        if not facteurs:
            return "Secteur stable a surveiller."
        return ", ".join(facteur["label"] for facteur in facteurs[:2])

    def _action_secteur(self, score):
        if score >= 70:
            return "Declencher une verification terrain rapide et revoir la prochaine planification."
        if score >= 45:
            return "Planifier un controle technique et renforcer le prochain passage."
        if score >= 20:
            return "Surveiller le prochain passage et completer les donnees manquantes."
        return "Maintenir la surveillance normale du secteur."

    def _lecture_plan(self, marge, objectif, reference):
        if marge < 0:
            return "Capacite insuffisante : l'equipe proposee doit etre renforcee."
        if objectif > reference * 1.2:
            return "Objectif ambitieux : plan soutenu recommande."
        if marge > 35:
            return "Marge confortable : l'equipe proposee couvre l'objectif."
        return "Plan equilibre pour le rendement vise."

    def _lecture_objectif(self, valeur, objectif):
        if not objectif:
            return "Aucun objectif mensuel disponible pour comparaison."
        if valeur >= objectif * 1.1:
            return "Prediction superieure a l'objectif mensuel."
        if valeur >= objectif * 0.9:
            return "Prediction proche de l'objectif mensuel."
        return "Prediction inferieure a l'objectif mensuel."

    def _resume_prediction(self, valeur, objectif, confiance):
        lecture = self._lecture_objectif(valeur, objectif)
        return f"{lecture} Niveau de confiance : {confiance}."

    def _lecture_feature(self, feature, valeur):
        numeric = _float(valeur, None)
        if feature == "age_moyen_plants" and numeric is not None:
            if numeric < 5:
                return "Plants jeunes : potentiel encore en installation."
            if numeric > 25:
                return "Plants vieillissants : risque de rendement plus faible."
            return "Age productif favorable."
        if feature == "precipitation_mm" and numeric is not None:
            if numeric < 50:
                return "Pluie faible : risque de stress hydrique."
            if numeric > 250:
                return "Pluie forte : risque d'acces difficile ou pertes."
            return "Pluviometrie dans une zone normale."
        if feature == "temperature_moy" and numeric is not None:
            if numeric > 33:
                return "Temperature elevee : surveiller stress et organisation terrain."
            return "Temperature compatible avec une activite normale."
        if feature == "humidite_pct" and numeric is not None:
            if numeric < 45:
                return "Humidite faible : conditions seches a surveiller."
            if numeric > 90:
                return "Humidite forte : risque de conditions difficiles."
            return "Humidite dans une plage exploitable."
        if feature == "superficie_ha" and numeric is not None:
            return "Superficie structurante pour le volume attendu."
        if feature == "nb_palmiers" and numeric is not None:
            return "Nombre de palmiers determinant pour la capacite productive."
        if feature == "rendement_cible" and numeric is not None:
            return "Objectif agronomique utilise comme reference."
        return "Facteur pris en compte par le moteur de prediction."
