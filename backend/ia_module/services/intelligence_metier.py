"""
Service de synthèse IA orientée métier.

Cette couche traduit les sorties techniques du module IA en décisions lisibles :
priorités, recommandations, simulations et prescriptions opérationnelles.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from math import ceil

from django.db.models import Q, Sum


MOIS = [
    "",
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
]


ROLE_LABELS = {
    "admin": "Administrateur",
    "superviseur": "Superviseur",
    "superviseur_adjoint": "Superviseur adjoint",
    "encadreur_technique": "Encadreur technique",
}


def _float(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _decimal(value):
    return Decimal(str(_float(value))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pct(value):
    return round(_float(value), 1)


class IntelligenceMetier:
    def __init__(self, user):
        self.user = user
        self.role = self._get_role()

    def _get_role(self):
        try:
            return self.user.profile.role
        except AttributeError:
            return "superviseur"

    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_superviseur(self):
        return self.role in ("superviseur", "superviseur_adjoint")

    @property
    def is_encadreur(self):
        return self.role == "encadreur_technique"

    @property
    def limit_to_owner(self):
        return self.is_superviseur

    def build_synthese(self, year=None):
        from ia_module.models import Anomalie, DonneeMeteo, ModeleIA, Prediction
        from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
        from secteurs.models import Secteur
        from travaux.models import FicheTravaux

        today = date.today()
        target_year = int(year or today.year)

        fiches = FicheRecolte.objects.filter(statut="valide", date__year=target_year)
        travaux = FicheTravaux.objects.filter(statut="valide", created_at__year=target_year)
        if self.limit_to_owner:
            fiches = fiches.filter(created_by=self.user)
            travaux = travaux.filter(created_by=self.user)

        details = FicheRecolteDetail.objects.filter(ligne__fiche__in=fiches)
        total_regimes = int(details.aggregate(total=Sum("quantite"))["total"] or 0)
        total_kg = _float(
            FicheRecuVente.objects.filter(fiche__in=fiches, statut="valide")
            .aggregate(total=Sum("pesee_kg"))["total"]
        )

        anomalies = Anomalie.objects.all()
        if self.limit_to_owner:
            anomalies = anomalies.filter(Q(fiche_recolte__created_by=self.user) | Q(fiche_recolte__isnull=True))

        anomalies_nouvelles = anomalies.filter(statut="nouvelle")
        anomalies_critiques = anomalies_nouvelles.filter(criticite__in=("critique", "elevee"))
        modeles_actifs = ModeleIA.objects.filter(actif=True)
        predictions = Prediction.objects.select_related("secteur", "modele").order_by("-date_prediction")

        qualite = self._qualite_donnees(
            fiches_count=fiches.count(),
            secteurs_count=Secteur.objects.count(),
            modeles_count=modeles_actifs.count(),
            meteo_count=DonneeMeteo.objects.count(),
        )

        indicateurs = [
            {
                "code": "production",
                "label": "Production analysée",
                "valeur": total_regimes,
                "unite": "régimes",
                "niveau": "normal",
            },
            {
                "code": "poids",
                "label": "Poids vendu analysé",
                "valeur": round(total_kg, 2),
                "unite": "kg",
                "niveau": "normal",
            },
            {
                "code": "alertes",
                "label": "Alertes à traiter",
                "valeur": anomalies_nouvelles.count(),
                "unite": "",
                "niveau": "alerte" if anomalies_critiques.exists() else "normal",
            },
            {
                "code": "qualite",
                "label": "Qualité des données IA",
                "valeur": qualite["score"],
                "unite": "%",
                "niveau": qualite["niveau"],
            },
        ]

        contexte = {
            "role": self.role,
            "role_label": ROLE_LABELS.get(self.role, "Utilisateur"),
            "annee": target_year,
            "periode": f"{MOIS[today.month]} {today.year}",
            "message": self._message_role(),
        }

        return {
            "contexte": contexte,
            "indicateurs": indicateurs,
            "modules": self._modules_role(),
            "actions_prioritaires": self._actions_prioritaires(
                anomalies_nouvelles=anomalies_nouvelles,
                modeles_count=modeles_actifs.count(),
                qualite=qualite,
            ),
            "previsions_recentes": self._previsions_recentes(predictions[:6]),
            "qualite_donnees": qualite,
            "seuils_metier": [
                {"label": "Écart de production à surveiller", "valeur": "30%"},
                {"label": "Rendement critique", "valeur": "moins de 50% de l'objectif"},
                {"label": "Variation récolteur inhabituelle", "valeur": "plus de 50% de la moyenne"},
                {"label": "Poids moyen anormal", "valeur": "hors plage 5-40 kg/régime"},
            ],
        }

    def simuler(self, data):
        from secteurs.models import Secteur

        secteur_id = data.get("secteur_id")
        if not secteur_id:
            raise ValueError("Le secteur est requis.")

        try:
            secteur = Secteur.objects.get(pk=int(secteur_id))
        except Secteur.DoesNotExist as exc:
            raise ValueError("Secteur introuvable.") from exc

        target_year = int(data.get("annee_cible") or date.today().year)
        target_month = int(data.get("mois_cible") or date.today().month)
        recolteurs = max(1, int(data.get("nb_recolteurs") or 6))
        heures = max(1.0, _float(data.get("nb_heures"), 7.0))
        cycle = max(1, int(data.get("frequence_cycle_jours") or 15))
        pluie_pct = _float(data.get("variation_pluie_pct"), 0.0)
        entretien_score = max(0.0, min(100.0, _float(data.get("niveau_entretien"), 60.0)))

        base = self._baseline_prediction(secteur, target_year, target_month)
        facteurs = [
            self._factor("Équipe mobilisée", 1 + min((recolteurs - 6) * 0.035, 0.35)),
            self._factor("Durée de travail", 1 + max(-0.25, min((heures - 7) * 0.045, 0.25))),
            self._factor("Fréquence de passage", 1 + max(-0.25, min((15 - cycle) * 0.012, 0.25))),
            self._factor("Pluie estimée", 1 + max(-0.18, min(pluie_pct * 0.002, 0.18))),
            self._factor("Entretien du secteur", 1 + max(-0.20, min((entretien_score - 60) * 0.004, 0.22))),
        ]
        facteur_global = 1.0
        for item in facteurs:
            facteur_global *= item["facteur"]

        valeur_simulee = max(0, base * facteur_global)
        variation_pct = ((valeur_simulee - base) / base * 100) if base else 0

        return {
            "secteur": {"id": secteur.id, "code": secteur.code, "nom": secteur.nom},
            "periode": {"annee": target_year, "mois": target_month, "mois_label": MOIS[target_month]},
            "scenario": {
                "nb_recolteurs": recolteurs,
                "nb_heures": heures,
                "frequence_cycle_jours": cycle,
                "variation_pluie_pct": pluie_pct,
                "niveau_entretien": entretien_score,
            },
            "rendement_reference": round(base, 2),
            "rendement_simule": round(valeur_simulee, 2),
            "variation_pct": _pct(variation_pct),
            "facteurs": facteurs,
            "lecture": self._lecture_simulation(variation_pct),
            "actions": self._actions_simulation(variation_pct, cycle, entretien_score),
        }

    def creer_prescription(self, data):
        from ia_module.models import Prescription
        from secteurs.models import Secteur

        secteur_id = data.get("secteur_id")
        if not secteur_id:
            raise ValueError("Le secteur est requis.")

        try:
            secteur = Secteur.objects.get(pk=int(secteur_id))
        except Secteur.DoesNotExist as exc:
            raise ValueError("Secteur introuvable.") from exc

        target_year = int(data.get("annee_cible") or date.today().year)
        target_month = int(data.get("mois_cible") or date.today().month)
        objectif = _float(data.get("objectif_regimes"))
        if objectif <= 0:
            objectif = self._objectif_secteur(secteur)

        baseline = self._baseline_prediction(secteur, target_year, target_month)
        productivite = max(20.0, self._productivite_moyenne())
        ecart_pct = ((objectif - baseline) / max(objectif, 1) * 100) if objectif else 0
        nb_fiches = 2 if objectif < 1200 else 3
        nb_recolteurs = max(2, min(40, ceil(objectif / max(productivite * nb_fiches, 1))))
        frequence = 10 if ecart_pct > 30 else 15

        conseils = [
            {
                "titre": "Organiser la prochaine récolte",
                "detail": f"Prévoir environ {nb_recolteurs} récolteurs sur {nb_fiches} fiche(s) de passage.",
            },
            {
                "titre": "Contrôler le secteur avant passage",
                "detail": "Vérifier l'état des pistes, la maturité des régimes et les zones sous-performantes.",
            },
            {
                "titre": "Suivre l'Écart après exécution",
                "detail": "Comparer la production réelle avec l'objectif pour ajuster la prochaine planification.",
            },
        ]
        alertes = []
        if ecart_pct > 35:
            alertes.append({
                "niveau": "elevee",
                "message": "L'objectif est ambitieux par rapport aux données historiques du secteur.",
            })
        if not secteur.rendement_cible_t_ha:
            alertes.append({
                "niveau": "moyenne",
                "message": "Le rendement cible du secteur n'est pas renseigné.",
            })

        return Prescription.objects.create(
            secteur=secteur,
            annee_cible=target_year,
            mois_cible=target_month,
            objectif_regimes=_decimal(objectif),
            rendement_predit=_decimal(baseline),
            ecart_objectif_pct=_pct(ecart_pct),
            nb_recolteurs_recommande=nb_recolteurs,
            nb_heures_recommande=Decimal("7.0"),
            frequence_cycle_jours=frequence,
            nb_fiches_recommande=nb_fiches,
            facteur_saisonnier=self._facteur_saisonnier(target_month),
            score_confiance=self._score_confiance(),
            productivite_moy=_decimal(productivite),
            conseils=conseils,
            alertes=alertes,
            details_calcul={
                "rendement_reference": round(baseline, 2),
                "objectif": round(objectif, 2),
                "productivite_moyenne": round(productivite, 2),
            },
            created_by=self.user,
        )

    def _message_role(self):
        if self.is_admin:
            return "Pilotez la fiabilité globale, les alertes et l'amélioration continue du système intelligent."
        if self.is_encadreur:
            return "Concentrez-vous sur les diagnostics agronomiques et les secteurs à risque."
        if self.is_superviseur:
            return "Priorisez les secteurs, corrigez les fiches à risque et planifiez les passages de terrain."
        return "Consultez les tâches utiles, les alertes simples et les conseils opérationnels."

    def _modules_role(self):
        common = [
            {"code": "predire", "label": "Prévoir la production", "description": "Estimer les régimes attendus par secteur et par période."},
            {"code": "alerter", "label": "Signaler les anomalies", "description": "Identifier les Écarts de production, de poids ou de performance."},
            {"code": "expliquer", "label": "Expliquer les Écarts", "description": "Traduire les signaux IA en causes probables."},
        ]
        if self.is_admin:
            return common + [
                {"code": "gouverner", "label": "Piloter la qualité IA", "description": "Suivre données, alertes, fiabilité et réentraînement."},
                {"code": "auditer", "label": "Tracer les décisions", "description": "Contrôler les validations, rejets et corrections."},
            ]
        if self.is_encadreur or self.is_superviseur:
            return common
        return [
            {"code": "taches", "label": "Voir les priorités du jour", "description": "Afficher les secteurs et objectifs utiles."},
            {"code": "suivi", "label": "Suivre sa performance", "description": "Comprendre la production et les alertes simples."},
        ]

    def _actions_prioritaires(self, anomalies_nouvelles, modeles_count, qualite):
        actions = []
        critiques = anomalies_nouvelles.filter(criticite__in=("critique", "elevee")).count()
        if critiques:
            actions.append({
                "priorite": "haute",
                "titre": "Traiter les alertes importantes",
                "detail": f"{critiques} alerte(s) critique(s) ou élevée(s) demandent une vérification.",
                "cible": "/ia/anomalies",
            })
        if self.is_admin and modeles_count == 0:
            actions.append({
                "priorite": "haute",
                "titre": "Activer le moteur intelligent",
                "detail": "Aucun modèle actif n'est disponible pour les predictions automatiques.",
                "cible": "/ia/modeles",
            })
        if self.is_admin and qualite["score"] < 70:
            actions.append({
                "priorite": "moyenne",
                "titre": "Améliorer les données IA",
                "detail": "Certaines données utiles sont absentes ou insuffisantes.",
                "cible": "/ia",
            })
        if not actions:
            actions.append({
                "priorite": "normale",
                "titre": "Surveillance stable",
                "detail": "Aucune urgence majeure détectée pour le moment.",
                "cible": "/dashboard",
            })
        return actions[:5]

    def _secteurs_prioritaires(self, year, details, anomalies):
        from recoltes.models import FicheRecolteDetail
        from secteurs.models import Secteur

        results = []
        for secteur in Secteur.objects.all().order_by("code"):
            production = int(details.filter(secteur=secteur).aggregate(total=Sum("quantite"))["total"] or 0)
            previous = int(
                FicheRecolteDetail.objects.filter(
                    ligne__fiche__statut="valide",
                    ligne__fiche__date__year=year - 1,
                    secteur=secteur,
                ).aggregate(total=Sum("quantite"))["total"] or 0
            )
            superficie = _float(secteur.superficie_ha, 0)
            rendement = round(production / superficie, 2) if superficie else 0
            cible = self._objectif_secteur(secteur)
            cible_ha = _float(secteur.rendement_cible_t_ha, 0) * 10
            anomalies_count = anomalies.filter(secteur=secteur).count()
            baisse = ((previous - production) / previous * 100) if previous else 0

            score = 0
            motifs = []
            if anomalies_count:
                score += min(45, anomalies_count * 15)
                motifs.append(f"{anomalies_count} alerte(s) ouverte(s)")
            if cible and production and production < cible * 0.55:
                score += 30
                motifs.append("production sous l'objectif attendu")
            if cible_ha and rendement < cible_ha * 0.55:
                score += 20
                motifs.append("rendement par hectare faible")
            if baisse > 20:
                score += 20
                motifs.append(f"baisse de {baisse:.1f}% vs année précédente")
            if not secteur.rendement_cible_t_ha:
                score += 8
                motifs.append("objectif de rendement non renseigné")

            if score or production or previous:
                results.append({
                    "id": secteur.id,
                    "code": secteur.code,
                    "nom": secteur.nom,
                    "production_regimes": production,
                    "production_precedente": previous,
                    "rendement_reg_ha": rendement,
                    "objectif_regimes": round(cible, 2),
                    "score_risque": min(100, score),
                    "niveau": self._niveau_risque(score),
                    "motif": ", ".join(motifs) if motifs else "secteur stable à surveiller",
                    "action_recommandee": self._action_secteur(score),
                })

        return sorted(results, key=lambda row: row["score_risque"], reverse=True)[:8]

    def _previsions_recentes(self, predictions):
        rows = []
        for p in predictions:
            rows.append({
                "id": p.id,
                "secteur": p.secteur.code if p.secteur else "",
                "periode": f"{MOIS[p.mois_cible] if p.mois_cible else ''} {p.annee_cible}".strip(),
                "valeur_predite": _float(p.valeur_predite),
                "intervalle": [_float(p.intervalle_bas), _float(p.intervalle_haut)],
                "lecture": self._lecture_prediction(p),
            })
        return rows

    def _qualite_donnees(self, fiches_count, secteurs_count, modeles_count, meteo_count):
        score = 100
        points_faibles = []
        if fiches_count < 10:
            score -= 25
            points_faibles.append("peu de fiches validées")
        if secteurs_count == 0:
            score -= 25
            points_faibles.append("aucun secteur paramétré")
        if modeles_count == 0:
            score -= 30
            points_faibles.append("aucun moteur de prédiction actif")
        if meteo_count == 0:
            score -= 10
            points_faibles.append("données météo absentes")
        score = max(0, score)
        return {
            "score": score,
            "niveau": "normal" if score >= 75 else "alerte" if score >= 50 else "critique",
            "points_faibles": points_faibles,
            "lecture": "Données suffisantes" if score >= 75 else "Données à renforcer pour de meilleures décisions",
        }

    def _baseline_prediction(self, secteur, year, month):
        from ia_module.models import Prediction
        from recoltes.models import FicheRecolteDetail

        prediction = (
            Prediction.objects.filter(secteur=secteur, annee_cible=year, mois_cible=month)
            .order_by("-date_prediction")
            .first()
        )
        if prediction:
            return _float(prediction.valeur_predite)

        same_month = FicheRecolteDetail.objects.filter(
            ligne__fiche__statut="valide",
            ligne__fiche__date__month=month,
            secteur=secteur,
        ).values("ligne__fiche__date__year").annotate(total=Sum("quantite"))
        values = [_float(row["total"]) for row in same_month]
        if values:
            return sum(values) / len(values)

        any_month = FicheRecolteDetail.objects.filter(
            ligne__fiche__statut="valide",
            secteur=secteur,
        ).values("ligne__fiche__date__year", "ligne__fiche__date__month").annotate(total=Sum("quantite"))
        values = [_float(row["total"]) for row in any_month]
        if values:
            return sum(values) / len(values)

        return self._objectif_secteur(secteur) or 500.0

    def _objectif_secteur(self, secteur):
        superficie = _float(secteur.superficie_ha, 0)
        cible_t_ha = _float(secteur.rendement_cible_t_ha, 0)
        if superficie and cible_t_ha:
            return superficie * cible_t_ha * 10
        if superficie:
            return superficie * 120
        return 500.0

    def _productivite_moyenne(self):
        from recoltes.models import FicheRecolteDetail

        rows = (
            FicheRecolteDetail.objects.filter(
                ligne__fiche__statut="valide",
                ligne__recolteur__isnull=False,
            )
            .values("ligne__recolteur")
            .annotate(total=Sum("quantite"))
        )
        values = [_float(row["total"]) for row in rows if _float(row["total"]) > 0]
        return sum(values) / len(values) if values else 80.0

    def _score_confiance(self):
        """
        Se base sur le modèle de régression actif avec le meilleur R², pas le
        plus récemment entraîné (même bug que _latest_regression_model dans
        views.py, corrigé ici aussi : .order_by("-date_entrainement").first()
        ne garantit pas de choisir le meilleur modèle si plusieurs sont actifs).
        """
        from ia_module.models import ModeleIA

        modeles = list(ModeleIA.objects.filter(actif=True, type_tache="regression"))
        if not modeles:
            return 45
        modele = max(modeles, key=lambda m: (m.metriques or {}).get("r2", float("-inf")))
        r2 = _float(modele.metriques.get("r2"), 0.5)
        return max(35, min(95, round(r2 * 100)))

    def _facteur_saisonnier(self, month):
        if month in (5, 6, 7, 8):
            return 1.08
        if month in (12, 1, 2):
            return 0.94
        return 1.0

    def _factor(self, label, facteur):
        facteur = max(0.65, min(1.45, facteur))
        return {
            "label": label,
            "facteur": round(facteur, 3),
            "impact_pct": _pct((facteur - 1) * 100),
        }

    def _lecture_simulation(self, variation_pct):
        if variation_pct >= 15:
            return "Scénario favorable : le plan peut nettement améliorer le rendement attendu."
        if variation_pct >= 5:
            return "Scénario intéressant : l'impact attendu est positif mais modéré."
        if variation_pct <= -10:
            return "Scénario risqué : les conditions proposées peuvent réduire la production."
        return "Scénario stable : peu d'impact attendu sur la production."

    def _actions_simulation(self, variation_pct, cycle, entretien_score):
        actions = []
        if cycle > 18:
            actions.append("Raccourcir le cycle de passage pour éviter les pertes de régimes mûrs.")
        if entretien_score < 50:
            actions.append("Programmer un entretien technique avant la récolte.")
        if variation_pct < 5:
            actions.append("Tester une Équipe plus large ou une meilleure fréquence de passage.")
        if not actions:
            actions.append("Conserver ce scénario comme base de planification.")
        return actions

    def _lecture_prediction(self, prediction):
        valeur = _float(prediction.valeur_predite)
        bas = _float(prediction.intervalle_bas)
        haut = _float(prediction.intervalle_haut)
        if haut and bas and haut - bas > valeur * 0.5:
            return "Estimation utile mais incertaine : renforcer les données du secteur."
        return "Estimation exploitable pour la planification."

    def _niveau_risque(self, score):
        if score >= 70:
            return "critique"
        if score >= 45:
            return "eleve"
        if score >= 20:
            return "moyen"
        return "faible"

    def _action_secteur(self, score):
        if score >= 70:
            return "Déclencher une vérification terrain rapide et revoir la prochaine planification."
        if score >= 45:
            return "Planifier un contrôle technique et comparer avec les fiches récentes."
        if score >= 20:
            return "Surveiller le prochain passage et confirmer les données de récolte."
        return "Maintenir la surveillance normale du secteur."
