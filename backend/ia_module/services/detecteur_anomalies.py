"""
services/detecteur_anomalies.py — Détection d'anomalies par règles métier et algorithmes ML.

Algorithmes :
  - Règles métier  : seuils définis par expertise agronomique
  - Isolation Forest : détection non supervisée
  - Arbre de décision + Régression logistique : détection supervisée
  - Résidu du modèle de prédiction : écart non expliqué par le Random Forest
"""
import logging
import numpy as np
from django.utils import timezone

from .data_collector import DataCollector
from .data_generator import DataGenerator
from .ml_pipeline import (
    FEATURES_ANOMALIE, FEATURES_REGRESSION, TARGET_CLASSIFICATION,
    preprocess, cross_validate_classification,
    save_model, load_model, load_scaler, get_feature_importances,
    _add_features,
)

logger = logging.getLogger(__name__)

MIN_OBS_ANOMALIE = 30


class DetecteurAnomalies:
    """Détecte les anomalies de production par règles métier et ML."""

    # ── Règles métier ────────────────────────────────────────────────

    def detecter_par_regles(self):
        """
        Applique les 4 règles métier et crée des Anomalie en base.
        Retourne la liste des anomalies créées.
        """
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolte, FicheRecolteDetail
        from django.db.models import Sum, Avg

        created = []

        # 1. Récolte > 30 % de la moyenne du secteur
        created += self._regle_ecart_secteur()

        # 2. Rendement < 50 % du rendement cible du secteur
        created += self._regle_rendement_faible()

        # 3. Récolteur > 50 % de la moyenne de l'équipe
        created += self._regle_ecart_recolteur()

        # 4. Cohérence poids / nombre de régimes
        created += self._regle_coherence_poids()

        logger.info("Règles métier : %d anomalies détectées", len(created))
        return created

    def _regle_ecart_secteur(self):
        """
        Alerte si une récolte s'écarte de plus de 3 écarts interquartiles (IQR)
        de la médiane du secteur pour le même mois, calculée sur les années
        proches (± 2 ans) — convention de Tukey pour les valeurs extrêmes
        (identique à celle des boîtes à moustaches).

        Ce seuil remplace un pourcentage fixe (30% vs moyenne) pour deux raisons
        vérifiées empiriquement sur les données réelles :
          1. Comparer à la moyenne de tout l'historique du secteur confond
             saisonnalité et tendance de maturation des palmiers avec de
             vraies anomalies (voir `DataCollector.collect_anomalie_labels`,
             qui applique la même fenêtre ± 2 ans) ;
          2. La distribution des quantités récoltées est nettement asymétrique
             (skewness ≈ 1,7, alors que 0 = symétrique) : un seuil basé sur la
             moyenne/écart-type suppose une distribution à peu près symétrique,
             ce qui n'est pas le cas ici, et un pourcentage fixe raisonnable
             (30%) déclenchait ~61% d'alertes vu le bruit réel des données. La
             médiane/IQR est robuste à cette asymétrie et aux valeurs extrêmes
             déjà présentes dans l'historique de référence. Seuil calibré
             empiriquement pour un taux d'alerte < 10%.
        """
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolteDetail
        from django.db.models import Sum

        created = []
        qs = (
            FicheRecolteDetail.objects
            .filter(ligne__fiche__statut="valide", secteur__isnull=False)
            .values("secteur_id", "ligne__fiche__date__year", "ligne__fiche__date__month")
            .annotate(qty=Sum("quantite"))
        )
        data = list(qs)

        FENETRE_ANNEES = 2
        SEUIL_IQR = 3.0

        secteur_all = {}
        secteur_mois_groups = {}
        for r in data:
            sid = r["secteur_id"]
            secteur_all.setdefault(sid, []).append(float(r["qty"] or 0))
            secteur_mois_groups.setdefault((sid, r["ligne__fiche__date__month"]), []).append(r)

        for r in data:
            sid = r["secteur_id"]
            annee = r["ligne__fiche__date__year"]
            mois = r["ligne__fiche__date__month"]
            group = secteur_mois_groups[(sid, mois)]
            voisins = [
                float(g["qty"] or 0) for g in group
                if g is not r and abs(g["ligne__fiche__date__year"] - annee) <= FENETRE_ANNEES
            ]
            reference = voisins if len(voisins) >= 3 else secteur_all.get(sid, [])
            if len(reference) < 3:
                continue

            mediane = float(np.median(reference))
            q1, q3 = np.percentile(reference, 25), np.percentile(reference, 75)
            iqr = max(float(q3 - q1), 1.0)

            qty = float(r["qty"] or 0)
            score_iqr = abs(qty - mediane) / iqr
            if score_iqr <= SEUIL_IQR:
                continue
            ecart_pct = abs(qty - mediane) / max(mediane, 1) * 100
            if Anomalie.objects.filter(
                type_anomalie="recolte",
                secteur_id=sid,
                methode_detection="regles_metier",
                details__annee=annee,
                details__mois=mois,
            ).exists():
                continue
            criticite = "elevee" if score_iqr > 5 else "moyenne"
            a = Anomalie.objects.create(
                type_anomalie="recolte",
                criticite=criticite,
                description=(
                    f"Production du secteur #{sid} en "
                    f"{mois:02d}/{annee} : "
                    f"{qty:.0f} régimes, écart de {score_iqr:.1f}x l'IQR vs médiane du même mois ({mediane:.0f})."
                ),
                valeur_observee=qty,
                valeur_reference=mediane,
                ecart_pct=ecart_pct,
                methode_detection="regles_metier",
                secteur_id=sid,
                details={
                    "annee": annee,
                    "mois":  mois,
                    "regle": "ecart_secteur_iqr3",
                    "score_iqr": round(score_iqr, 2),
                },
            )
            created.append(a)

        return created

    def _regle_rendement_faible(self):
        """
        Alerte si la production réelle CUMULÉE SUR L'ANNÉE < 50% de l'objectif
        annuel du secteur (rendement_cible_t_ha × superficie), au prorata du
        nombre de mois réellement couverts par des fiches validées.

        Comparaison au niveau de l'année entière, et non du mois : rendement_cible_t_ha
        est un objectif ANNUEL — le comparer directement à la production d'un seul
        mois faisait déclencher la règle presque en permanence (vérifié : le ratio
        mensuel/cible se situe entre 8% et 18% pour tous les secteurs, bien en dessous
        du seuil de 50%, alors qu'il s'agissait de mois de production tout à fait
        normaux — pas d'un vrai sous-rendement).

        Le prorata au nombre de mois couverts évite un autre biais : l'année en
        cours n'a que quelques mois de fiches validées (ex. janvier-juin) — comparer
        cette production partielle à l'objectif d'une année complète la ferait
        paraître anormalement basse alors que rien n'est anormal, seule l'année
        n'est pas terminée.
        """
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolteDetail
        from django.db.models import Sum, Count

        created = []
        qs = (
            FicheRecolteDetail.objects
            .filter(ligne__fiche__statut="valide", secteur__isnull=False)
            .select_related("secteur")
            .values(
                "secteur_id", "secteur__rendement_cible_t_ha", "secteur__superficie_ha",
                "ligne__fiche__date__year",
            )
            .annotate(
                qty=Sum("quantite"),
                nb_mois=Count("ligne__fiche__date__month", distinct=True),
            )
        )

        for r in qs:
            cible_t_ha = float(r["secteur__rendement_cible_t_ha"] or 0)
            superficie = float(r["secteur__superficie_ha"] or 1)
            if cible_t_ha <= 0:
                continue
            nb_mois = min(12, r["nb_mois"] or 0)
            if nb_mois <= 0:
                continue
            # Conversion grossière : 1 tonne ≈ 10 régimes grands, cible ajustée
            # au nombre de mois couverts (année complète ou partielle).
            cible_qty = cible_t_ha * superficie * 10 * (nb_mois / 12)
            qty = float(r["qty"] or 0)
            if qty <= 0:
                continue
            ratio = qty / max(cible_qty, 1)
            if ratio >= 0.5:
                continue
            ecart_pct = (1 - ratio) * 100
            annee = r["ligne__fiche__date__year"]
            if Anomalie.objects.filter(
                type_anomalie="rendement",
                secteur_id=r["secteur_id"],
                methode_detection="regles_metier",
                details__annee=annee,
            ).exists():
                continue
            a = Anomalie.objects.create(
                type_anomalie="rendement",
                criticite="critique" if ratio < 0.25 else "elevee",
                description=(
                    f"Rendement annuel du secteur #{r['secteur_id']} en {annee} : "
                    f"{qty:.0f} régimes, soit {ratio*100:.1f}% de l'objectif annuel ({cible_qty:.0f}). "
                    f"Écart : -{ecart_pct:.1f}%."
                ),
                valeur_observee=qty,
                valeur_reference=cible_qty,
                ecart_pct=ecart_pct,
                methode_detection="regles_metier",
                secteur_id=r["secteur_id"],
                details={
                    "annee": annee,
                    "regle": "rendement_sous_50pct",
                },
            )
            created.append(a)

        return created

    def _regle_ecart_recolteur(self):
        """
        Alerte si un récolteur s'écarte de plus de 3 écarts interquartiles (IQR)
        de SA PROPRE production habituelle, pour le même type de régime.

        Comparaison au récolteur lui-même (pas aux autres récolteurs) : certains
        récolteurs produisent naturellement plus que d'autres pour un secteur ou
        un type de régime donné (expérience, capacité physique) — comparer entre
        personnes différentes confond cette variation naturelle avec une vraie
        anomalie. Vérifié empiriquement sur l'ancienne version (comparaison à la
        moyenne globale tous récolteurs confondus) : les récolteurs signalés
        travaillaient en moyenne dans des secteurs à 660 palmiers contre 467
        pour les non-signalés — la règle détectait surtout la taille du secteur,
        pas une vraie sur-performance individuelle.

        Limite assumée : cette méthode détecte un changement soudain de
        comportement, pas un récolteur anormal depuis toujours (qui semblerait
        "normal" par rapport à sa propre base déjà atypique) — complémentaire
        aux autres règles, pas une garantie absolue.
        """
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolteDetail
        from django.db.models import Sum

        created = []
        qs = (
            FicheRecolteDetail.objects
            .filter(ligne__fiche__statut="valide", ligne__recolteur__isnull=False)
            .values(
                "ligne__recolteur_id", "ligne__recolteur__nom", "ligne__regime_type",
                "ligne__fiche__date__year", "ligne__fiche__date__month",
            )
            .annotate(qty=Sum("quantite"))
        )
        data = list(qs)

        groups = {}
        for r in data:
            key = (r["ligne__recolteur_id"], r["ligne__regime_type"])
            groups.setdefault(key, []).append(r)

        for r in data:
            key = (r["ligne__recolteur_id"], r["ligne__regime_type"])
            group = groups[key]
            autres = [float(g["qty"] or 0) for g in group if g is not r]
            if len(autres) < 3:
                continue

            mediane = float(np.median(autres))
            q1, q3 = np.percentile(autres, 25), np.percentile(autres, 75)
            iqr = max(float(q3 - q1), 1.0)

            qty = float(r["qty"] or 0)
            score_iqr = abs(qty - mediane) / iqr
            if score_iqr <= 3.0:
                continue

            annee = r["ligne__fiche__date__year"]
            mois = r["ligne__fiche__date__month"]
            rid = r["ligne__recolteur_id"]
            regime_type = r["ligne__regime_type"]

            if Anomalie.objects.filter(
                type_anomalie="recolteur",
                recolteur_id=rid,
                methode_detection="regles_metier",
                details__annee=annee,
                details__mois=mois,
                details__regime_type=regime_type,
            ).exists():
                continue

            ecart_pct = (qty - mediane) / max(mediane, 1) * 100
            a = Anomalie.objects.create(
                type_anomalie="recolteur",
                criticite="elevee" if score_iqr > 5 else "moyenne",
                description=(
                    f"Récolteur {r['ligne__recolteur__nom']} ({regime_type}) : {qty:.0f} régimes "
                    f"en {mois:02d}/{annee}, contre {mediane:.0f} habituellement "
                    f"({ecart_pct:+.1f}%, {score_iqr:.1f}x IQR)."
                ),
                valeur_observee=qty,
                valeur_reference=mediane,
                ecart_pct=abs(ecart_pct),
                methode_detection="regles_metier",
                recolteur_id=rid,
                details={
                    "annee": annee,
                    "mois":  mois,
                    "regime_type": regime_type,
                    "regle": "ecart_recolteur_historique_iqr3",
                },
            )
            created.append(a)

        return created

    def _regle_coherence_poids(self):
        """
        Cohérence poids/régimes : si le poids pesé est très disproportionné
        par rapport au nombre total de régimes récoltés ce jour.
        (≈ 15 kg/régime en moyenne pour grands régimes)
        """
        from ia_module.models import Anomalie
        from recoltes.models import FicheRecolte, FicheRecolteDetail, FicheRecuVente
        from django.db.models import Sum

        created = []
        fiches = FicheRecolte.objects.filter(statut="valide").prefetch_related("recus")
        for fiche in fiches:
            total_regimes = (
                FicheRecolteDetail.objects
                .filter(ligne__fiche=fiche)
                .aggregate(total=Sum("quantite"))["total"] or 0
            )
            for recu in fiche.recus.all():
                pesee = float(recu.pesee_kg or 0)
                if pesee <= 0 or total_regimes <= 0:
                    continue
                kg_par_regime = pesee / total_regimes
                # Hors norme : < 5 kg ou > 40 kg par régime
                if 5 <= kg_par_regime <= 40:
                    continue
                ecart_ref = 15
                ecart_pct = abs(kg_par_regime - ecart_ref) / ecart_ref * 100
                if Anomalie.objects.filter(
                    type_anomalie="poids",
                    fiche_recolte=fiche,
                    methode_detection="regles_metier",
                ).exists():
                    continue
                a = Anomalie.objects.create(
                    type_anomalie="poids",
                    criticite="elevee" if kg_par_regime < 5 else "moyenne",
                    description=(
                        f"Incohérence poids/régimes fiche #{fiche.id} du {fiche.date} : "
                        f"{kg_par_regime:.1f} kg/régime (norme ≈ 15 kg/régime)."
                    ),
                    valeur_observee=kg_par_regime,
                    valeur_reference=ecart_ref,
                    ecart_pct=ecart_pct,
                    methode_detection="regles_metier",
                    fiche_recolte=fiche,
                    details={"regle": "coherence_poids_regime", "recu_id": recu.pk},
                )
                created.append(a)

        return created

    # ── Algorithmes ML ────────────────────────────────────────────────

    def entrainer_isolation_forest(self, user=None):
        """Isolation Forest (non supervisé) — détection d'anomalies."""
        from sklearn.ensemble import IsolationForest
        from ia_module.models import ModeleIA

        rows = self._get_anomalie_data(labeled=False)
        X, scaler = preprocess(rows, FEATURES_ANOMALIE)

        model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
        model.fit(X)

        model_path, _ = save_model(model, scaler, "isolation_forest")
        version = ModeleIA.objects.filter(algorithme="isolation_forest").count() + 1
        ModeleIA.objects.filter(algorithme="isolation_forest", actif=True).update(actif=False)

        modele_ia = ModeleIA.objects.create(
            nom=f"Isolation Forest v{version}",
            algorithme="isolation_forest",
            type_tache="anomalie",
            version=version,
            metriques={"model_path": model_path, "n_observations": len(rows)},
            features=FEATURES_ANOMALIE,
            nb_observations=len(rows),
            actif=True,
            created_by=user,
        )
        modele_ia.metriques["model_path"] = model_path
        modele_ia.save()
        logger.info("Isolation Forest entraîné sur %d obs (id=%d)", len(rows), modele_ia.pk)
        return modele_ia

    def entrainer_decision_tree(self, user=None):
        """Arbre de décision supervisé pour la classification d'anomalies."""
        from sklearn.tree import DecisionTreeClassifier
        return self._entrainer_classif(
            DecisionTreeClassifier, "decision_tree", "Arbre de Décision", user,
            max_depth=6, random_state=42,
        )

    def entrainer_logistic_regression(self, user=None):
        """Régression logistique supervisée pour la classification d'anomalies."""
        from sklearn.linear_model import LogisticRegression
        return self._entrainer_classif(
            LogisticRegression, "logistic_regression", "Régression Logistique", user,
            max_iter=500, random_state=42,
        )

    def _entrainer_classif(self, model_cls, algo_code, algo_name, user=None, **kwargs):
        from ia_module.models import ModeleIA

        rows = self._get_anomalie_data(labeled=True)
        metriques = cross_validate_classification(
            model_cls, rows, FEATURES_ANOMALIE, **kwargs
        )

        X, y, scaler = preprocess(rows, FEATURES_ANOMALIE, TARGET_CLASSIFICATION)
        model = model_cls(**kwargs)
        model.fit(X, y)

        model_path, _ = save_model(model, scaler, algo_code)
        importances = get_feature_importances(model, FEATURES_ANOMALIE)
        version = ModeleIA.objects.filter(algorithme=algo_code).count() + 1
        ModeleIA.objects.filter(algorithme=algo_code, actif=True).update(actif=False)

        modele_ia = ModeleIA.objects.create(
            nom=f"{algo_name} v{version}",
            algorithme=algo_code,
            type_tache="classification",
            version=version,
            metriques={**metriques, "importances": importances, "model_path": model_path},
            features=FEATURES_ANOMALIE,
            nb_observations=len(rows),
            actif=True,
            created_by=user,
        )
        modele_ia.save()
        logger.info("%s entraîné (id=%d, F1=%.3f)", algo_name, modele_ia.pk, metriques.get("f1", 0))
        return modele_ia

    def detecter_par_isolation_forest(self, modele_ia, fiche_recolte_id=None):
        """
        Utilise l'Isolation Forest pour détecter des anomalies sur la
        production MENSUELLE d'un secteur (toutes fiches du mois agrégées) —
        même granularité que l'entraînement (`collect_rendement_data`).

        Point corrigé : la détection agrégeait auparavant par fiche
        individuelle, alors que le modèle a appris ce qu'est une production
        MENSUELLE normale. Une fiche seule pèse en moyenne deux fois moins
        qu'un mois complet (vérifié : 81% des couples secteur/mois ont
        plusieurs fiches), donc le modèle jugeait presque systématiquement
        chaque fiche anormalement basse — 100% d'alerte, un détecteur inutile
        en pratique. Corrigé en agrégeant par (secteur, année, mois), et en
        utilisant la vraie météo du mois (au lieu de valeurs fixes 27°C/100mm/
        75%, qui ignoraient la localisation réelle du secteur).

        Si `fiche_recolte_id` est fourni, la vérification porte sur le MOIS
        complet auquel appartient cette fiche (secteur + année + mois), pas
        sur la fiche isolée.
        """
        from django.db.models import Q, Sum, Avg
        from ia_module.models import Anomalie, DonneeMeteo
        from recoltes.models import FicheRecolteDetail

        model_path = modele_ia.metriques.get("model_path", "")
        if not model_path:
            raise ValueError("Chemin du modèle introuvable.")

        model  = load_model(model_path)
        scaler = load_scaler(model_path)

        qs = FicheRecolteDetail.objects.filter(
            ligne__fiche__statut="valide",
            secteur__isnull=False,
        )
        if fiche_recolte_id:
            cibles = list(
                qs.filter(ligne__fiche_id=fiche_recolte_id)
                .values("secteur_id", "ligne__fiche__date__year", "ligne__fiche__date__month")
                .distinct()
            )
            if not cibles:
                return []
            filtre = Q()
            for c in cibles:
                filtre |= Q(
                    secteur_id=c["secteur_id"],
                    ligne__fiche__date__year=c["ligne__fiche__date__year"],
                    ligne__fiche__date__month=c["ligne__fiche__date__month"],
                )
            qs = qs.filter(filtre)

        rows_raw = (
            qs.values(
                "secteur_id", "secteur__superficie_ha", "secteur__age_moyen_plants",
                "secteur__nb_palmiers", "secteur__rendement_cible_t_ha",
                "ligne__fiche__date__year", "ligne__fiche__date__month",
            )
            .annotate(qty=Sum("quantite"))
        )

        created = []
        for r in rows_raw:
            annee = r["ligne__fiche__date__year"]
            mois = r["ligne__fiche__date__month"]
            sid = r["secteur_id"]

            meteo = DonneeMeteo.objects.filter(
                secteur_id=sid, date__year=annee, date__month=mois,
            ).aggregate(
                temp_moy=Avg("temperature_moy"),
                precip=Avg("precipitation_mm"),
                humid=Avg("humidite_pct"),
            )

            row = [{
                "annee":            annee,
                "mois":             mois,
                "secteur_id":       sid or 0,
                "superficie_ha":    float(r["secteur__superficie_ha"] or 0),
                "age_moyen_plants": float(r["secteur__age_moyen_plants"] or 10),
                "nb_palmiers":      float(r["secteur__nb_palmiers"] or 100),
                "rendement_cible":  float(r["secteur__rendement_cible_t_ha"] or 15),
                "temperature_moy":  float(meteo["temp_moy"] or 27),
                "precipitation_mm": float(meteo["precip"] or 100),
                "humidite_pct":     float(meteo["humid"] or 75),
                "quantite_totale":  float(r["qty"] or 0),
            }]
            X, _ = preprocess(row, FEATURES_ANOMALIE, scaler=scaler, fit_scaler=False)
            score = float(model.score_samples(X)[0])
            pred  = model.predict(X)[0]  # -1 = anomalie, 1 = normal

            if pred == -1:
                if Anomalie.objects.filter(
                    type_anomalie="recolte",
                    secteur_id=sid,
                    methode_detection="isolation_forest",
                    details__annee=annee,
                    details__mois=mois,
                ).exists():
                    continue
                qty = float(r["qty"] or 0)
                a = Anomalie.objects.create(
                    type_anomalie="recolte",
                    criticite="elevee",
                    description=(
                        f"Isolation Forest : production du secteur #{sid} en {mois:02d}/{annee} "
                        f"jugée atypique (score={score:.3f}, {qty:.0f} régimes ce mois)."
                    ),
                    valeur_observee=qty,
                    valeur_reference=0,
                    ecart_pct=0,
                    methode_detection="isolation_forest",
                    score_anomalie=score,
                    secteur_id=sid,
                    details={"annee": annee, "mois": mois, "score": score, "model_id": modele_ia.pk},
                )
                created.append(a)

        return created

    def detecter_par_residu_prediction(self, modele_ia):
        """
        Détecte les anomalies en comparant la production réelle à ce que le
        modèle de PRÉDICTION DE RENDEMENT (Random Forest) aurait attendu pour
        ce secteur/mois, compte tenu de tout son contexte : météo, âge des
        plants, superficie, saisonnalité.

        Contrairement à `_regle_ecart_secteur` (comparaison brute à la médiane
        du secteur/mois, qui ignore la météo) ou à l'Isolation Forest (score
        d'isolement non supervisé), une anomalie ici est un écart que le
        modèle N'EXPLIQUE PAS même en connaissant tout le contexte — si la
        production est basse à cause d'une vraie sécheresse ce mois-là, le
        modèle l'aura déjà anticipé et aucune alerte n'est levée.

        IMPORTANT : on ne réutilise PAS le modèle final déjà sauvegardé
        (`modele_ia`) pour prédire sur l'historique — ce modèle a été
        ré-entraîné sur 100% des données, donc il a déjà "vu" chaque
        observation et ses résidus dessus seraient artificiellement petits
        (quasi-mémorisation, vérifié empiriquement). On ré-entraîne ici un
        Random Forest identique en validation croisée à 5 plis pour obtenir,
        pour chaque observation, une prédiction faite par un modèle qui ne l'a
        PAS vue — seule façon honnête de mesurer "à quel point cette valeur
        est-elle surprenante".

        Seuil calibré empiriquement sur ces résidus hors échantillon : 2 x RMSE
        du modèle donne un taux d'alerte de ~6,3% sur les données réelles,
        sous l'objectif de 10%.
        """
        from ia_module.models import Anomalie
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.model_selection import KFold
        from .ml_pipeline import TARGET_REGRESSION

        rmse = modele_ia.metriques.get("rmse")
        if not rmse:
            raise ValueError("RMSE du modèle introuvable — impossible de calibrer le seuil.")
        rmse = float(rmse)

        rows = DataCollector().collect_rendement_data()
        if not rows:
            return []

        kf = KFold(n_splits=5, shuffle=True, random_state=42)
        indices = list(range(len(rows)))
        y_pred_oof = [None] * len(rows)

        for train_idx, val_idx in kf.split(indices):
            train = [rows[i] for i in train_idx]
            val = [rows[i] for i in val_idx]

            X_train, y_train, scaler = preprocess(train, FEATURES_REGRESSION, TARGET_REGRESSION)
            X_val, _ = preprocess(val, FEATURES_REGRESSION, scaler=scaler, fit_scaler=False)

            model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
            model.fit(X_train, y_train)
            preds = model.predict(X_val)
            for idx, pred in zip(val_idx, preds):
                y_pred_oof[idx] = pred

        y_pred = y_pred_oof
        SEUIL_RMSE = 2.0
        created = []
        for row, pred in zip(rows, y_pred):
            observe = float(row["quantite_totale"])
            residu = observe - float(pred)
            if abs(residu) <= SEUIL_RMSE * rmse:
                continue

            sid = row["secteur_id"]
            annee = row["annee"]
            mois = row["mois"]
            if Anomalie.objects.filter(
                type_anomalie="recolte",
                secteur_id=sid,
                methode_detection="residu_prediction",
                details__annee=annee,
                details__mois=mois,
            ).exists():
                continue

            score = abs(residu) / rmse
            ecart_pct = abs(residu) / max(pred, 1) * 100
            a = Anomalie.objects.create(
                type_anomalie="recolte",
                criticite="elevee" if score > 3 else "moyenne",
                description=(
                    f"Secteur #{sid} en {mois:02d}/{annee} : {observe:.0f} régimes observés, "
                    f"{pred:.0f} attendus par le modèle compte tenu du contexte "
                    f"(écart de {residu:+.0f}, {score:.1f}x RMSE)."
                ),
                valeur_observee=observe,
                valeur_reference=float(pred),
                ecart_pct=ecart_pct,
                methode_detection="residu_prediction",
                score_anomalie=score,
                secteur_id=sid,
                details={
                    "annee": annee,
                    "mois": mois,
                    "regle": "residu_prediction_2rmse",
                    "modele_id": modele_ia.pk,
                },
            )
            created.append(a)

        return created

    def _get_anomalie_data(self, labeled=True):
        collector = DataCollector()
        if labeled:
            rows = collector.collect_anomalie_labels()
        else:
            rows = collector.collect_rendement_data()

        if len(rows) < MIN_OBS_ANOMALIE:
            generator = DataGenerator()
            synth = generator.generate_anomalie_rows(n=500) if labeled else generator.generate_rendement_rows(n=500)
            rows = rows + synth

        return rows