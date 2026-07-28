from datetime import date

from django.db.models import Sum
from django.utils import timezone

from secteurs.models import Secteur
from .models import ObservationSanitaire, OperationPlantation, SuiviCroissance


def _as_float(value):
    if value is None:
        return None
    return round(float(value), 2)


def _as_date(value):
    return value.isoformat() if value else None


def _months_between(start_date, end_date):
    if not start_date or not end_date:
        return None
    months = (end_date.year - start_date.year) * 12 + end_date.month - start_date.month
    if end_date.day < start_date.day:
        months -= 1
    return max(months, 0)


def _clamp_score(value):
    return round(max(0, min(100, value)), 2)


class ContexteAgronomiqueService:
    """Construit la memoire agronomique exploitable par secteur."""

    ETAT_CROISSANCE_SCORE = {
        "bon": 100,
        "moyen": 75,
        "faible": 45,
        "critique": 20,
    }
    PENALITE_GRAVITE = {
        "faible": 5,
        "moyenne": 15,
        "elevee": 30,
        "critique": 50,
    }
    STATUTS_SANITAIRES_OUVERTS = {"nouvelle", "en_traitement", "surveillance"}

    def parse_date_reference(self, value=None):
        if not value:
            return timezone.localdate()
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValueError("date_reference doit etre au format YYYY-MM-DD.") from exc

    def lister_contextes(self, secteur_id=None, date_reference=None):
        ref = self.parse_date_reference(date_reference)
        secteurs = Secteur.objects.all().order_by("code")
        if secteur_id:
            secteurs = secteurs.filter(id=secteur_id)
        return [self.construire_pour_secteur(secteur, ref) for secteur in secteurs]

    def construire_pour_secteur(self, secteur, date_reference=None):
        if not isinstance(secteur, Secteur):
            secteur = Secteur.objects.get(pk=secteur)
        ref = self.parse_date_reference(date_reference)

        operation = self._derniere_operation(secteur, ref)
        lot_pepiniere = operation.lot_pepiniere if operation else None
        lot_semence = lot_pepiniere.lot_semence if lot_pepiniere else None

        suivis = self._suivis_croissance(secteur, operation, ref)
        observations = self._observations_sanitaires(secteur, operation, ref)
        dernier_suivi = suivis.first()

        indicateurs = self._calculer_indicateurs(
            secteur=secteur,
            operation=operation,
            lot_pepiniere=lot_pepiniere,
            lot_semence=lot_semence,
            suivis=suivis,
            observations=observations,
            date_reference=ref,
        )
        scores = self._calculer_scores(
            operation=operation,
            lot_pepiniere=lot_pepiniere,
            lot_semence=lot_semence,
            dernier_suivi=dernier_suivi,
            observations=observations,
            indicateurs=indicateurs,
        )
        donnees_manquantes = self._donnees_manquantes(
            secteur=secteur,
            operation=operation,
            lot_pepiniere=lot_pepiniere,
            lot_semence=lot_semence,
            nb_suivis=indicateurs["nb_suivis_croissance"],
        )

        return {
            "date_reference": _as_date(ref),
            "secteur": self._secteur_dict(secteur),
            "operation_plantation": self._operation_dict(operation),
            "lot_pepiniere": self._lot_pepiniere_dict(lot_pepiniere),
            "lot_semence": self._lot_semence_dict(lot_semence),
            "indicateurs": indicateurs,
            "scores": scores,
            "dernier_suivi_croissance": self._suivi_croissance_dict(dernier_suivi),
            "dernieres_observations_sanitaires": [
                self._observation_sanitaire_dict(obs) for obs in observations[:5]
            ],
            "donnees_manquantes": donnees_manquantes,
        }

    def _derniere_operation(self, secteur, date_reference):
        return (
            OperationPlantation.objects
            .select_related("secteur", "lot_pepiniere", "lot_pepiniere__lot_semence")
            .filter(secteur=secteur, date_plantation__lte=date_reference)
            .order_by("-date_plantation", "-id")
            .first()
        )

    def _suivis_croissance(self, secteur, operation, date_reference):
        qs = (
            SuiviCroissance.objects
            .filter(secteur=secteur, date_observation__lte=date_reference)
            .order_by("-date_observation", "-id")
        )
        if operation:
            qs = qs.filter(date_observation__gte=operation.date_plantation)
        return qs

    def _observations_sanitaires(self, secteur, operation, date_reference):
        qs = (
            ObservationSanitaire.objects
            .filter(secteur=secteur, date_observation__lte=date_reference)
            .order_by("-date_observation", "-id")
        )
        if operation:
            qs = qs.filter(date_observation__gte=operation.date_plantation)
        return qs

    def _calculer_indicateurs(self, secteur, operation, lot_pepiniere, lot_semence, suivis, observations, date_reference):
        croissance_totaux = suivis.aggregate(
            mortalite_total=Sum("mortalite"),
            plants_remplaces_total=Sum("plants_remplaces"),
        )
        observations_ouvertes = observations.filter(statut__in=self.STATUTS_SANITAIRES_OUVERTS)
        nb_plants = operation.nombre_plants if operation else (secteur.nb_palmiers or 0)
        mortalite_total = croissance_totaux["mortalite_total"] or 0
        mortalite_pct = round(mortalite_total / nb_plants * 100, 2) if nb_plants else None

        return {
            "age_plantation_mois": _months_between(operation.date_plantation, date_reference) if operation else None,
            "age_plants_a_la_plantation_mois": operation.age_plants_mois if operation else None,
            "age_estime_plants_mois": (
                (operation.age_plants_mois or 0) + _months_between(operation.date_plantation, date_reference)
                if operation and operation.age_plants_mois is not None
                else None
            ),
            "densite_plantation": _as_float(operation.densite_plantation) if operation else None,
            "taux_germination": _as_float(lot_semence.taux_germination) if lot_semence else None,
            "taux_survie_pepiniere": lot_pepiniere.taux_survie if lot_pepiniere else None,
            "mortalite_croissance_total": mortalite_total,
            "mortalite_croissance_pct": mortalite_pct,
            "plants_remplaces_total": croissance_totaux["plants_remplaces_total"] or 0,
            "nb_suivis_croissance": suivis.count(),
            "nb_alertes_sanitaires": observations.count(),
            "nb_alertes_sanitaires_ouvertes": observations_ouvertes.count(),
            "surface_sanitaire_touchee_ha": _as_float(
                observations.aggregate(total=Sum("surface_touchee_ha"))["total"]
            ),
        }

    def _calculer_scores(self, operation, lot_pepiniere, lot_semence, dernier_suivi, observations, indicateurs):
        scores_base = {
            "origine": self._score_origine(lot_pepiniere, lot_semence),
            "croissance": self._score_croissance(operation, dernier_suivi, indicateurs),
            "sanitaire": self._score_sanitaire(observations),
            "completude_donnees": self._score_completude(operation, lot_pepiniere, lot_semence, indicateurs),
        }
        scores_connus = [score for score in scores_base.values() if score is not None]
        score_moyen = sum(scores_connus) / len(scores_connus) if scores_connus else 0
        scores_base["confiance_contexte"] = _clamp_score(score_moyen)
        return scores_base

    def _score_origine(self, lot_pepiniere, lot_semence):
        if not lot_pepiniere or not lot_semence:
            return None

        score = 100
        taux_germination = _as_float(lot_semence.taux_germination)
        taux_survie = lot_pepiniere.taux_survie
        if taux_germination is None:
            score -= 15
        elif taux_germination < 60:
            score -= 35
        elif taux_germination < 75:
            score -= 20
        elif taux_germination < 85:
            score -= 8

        if taux_survie is None:
            score -= 15
        elif taux_survie < 70:
            score -= 35
        elif taux_survie < 85:
            score -= 18
        elif taux_survie < 92:
            score -= 8

        if not lot_semence.fournisseur:
            score -= 5
        if not lot_semence.certification:
            score -= 5
        return _clamp_score(score)

    def _score_croissance(self, operation, dernier_suivi, indicateurs):
        if not operation or not dernier_suivi:
            return None

        score = self.ETAT_CROISSANCE_SCORE.get(dernier_suivi.etat_general, 60)
        mortalite_pct = indicateurs.get("mortalite_croissance_pct")
        if mortalite_pct is not None:
            score -= min(40, mortalite_pct * 2)
        if dernier_suivi.stress_hydrique:
            score -= 10
        return _clamp_score(score)

    def _score_sanitaire(self, observations):
        score = 100
        for obs in observations.filter(statut__in=self.STATUTS_SANITAIRES_OUVERTS):
            score -= self.PENALITE_GRAVITE.get(obs.gravite, 15)
        return _clamp_score(score)

    def _score_completude(self, operation, lot_pepiniere, lot_semence, indicateurs):
        controles = [
            operation is not None,
            operation and operation.age_plants_mois is not None,
            operation and operation.nombre_plants > 0,
            operation and operation.densite_plantation is not None,
            lot_pepiniere is not None,
            lot_pepiniere and lot_pepiniere.nombre_plants_initial > 0,
            lot_semence is not None,
            lot_semence and lot_semence.taux_germination is not None,
            indicateurs["nb_suivis_croissance"] > 0,
        ]
        return round(sum(1 for item in controles if item) / len(controles) * 100, 2)

    def _donnees_manquantes(self, secteur, operation, lot_pepiniere, lot_semence, nb_suivis):
        manquantes = []
        if secteur.age_moyen_plants is None:
            manquantes.append("secteur.age_moyen_plants")
        if secteur.nb_palmiers is None:
            manquantes.append("secteur.nb_palmiers")
        if secteur.rendement_cible_t_ha is None:
            manquantes.append("secteur.rendement_cible_t_ha")
        if not operation:
            manquantes.append("operation_plantation")
            return manquantes
        if operation.age_plants_mois is None:
            manquantes.append("operation_plantation.age_plants_mois")
        if operation.densite_plantation is None:
            manquantes.append("operation_plantation.densite_plantation")
        if not lot_pepiniere:
            manquantes.append("lot_pepiniere")
        elif not lot_pepiniere.nombre_plants_initial:
            manquantes.append("lot_pepiniere.nombre_plants_initial")
        if not lot_semence:
            manquantes.append("lot_semence")
        elif lot_semence.taux_germination is None:
            manquantes.append("lot_semence.taux_germination")
        if not nb_suivis:
            manquantes.append("suivis_croissance")
        return manquantes

    def _secteur_dict(self, secteur):
        return {
            "id": secteur.id,
            "code": secteur.code,
            "nom": secteur.nom,
            "superficie_ha": _as_float(secteur.superficie_ha),
            "type_sol": secteur.type_sol,
            "situation_relief": secteur.situation_relief,
            "age_moyen_plants": secteur.age_moyen_plants,
            "nb_palmiers": secteur.nb_palmiers,
            "rendement_cible_t_ha": _as_float(secteur.rendement_cible_t_ha),
        }

    def _operation_dict(self, operation):
        if not operation:
            return None
        return {
            "id": operation.id,
            "code_operation": operation.code_operation,
            "date_plantation": _as_date(operation.date_plantation),
            "nombre_plants": operation.nombre_plants,
            "densite_plantation": _as_float(operation.densite_plantation),
            "ecartement_m": _as_float(operation.ecartement_m),
            "age_plants_mois": operation.age_plants_mois,
            "plants_remplaces": operation.plants_remplaces,
            "conditions_meteo": operation.conditions_meteo,
            "statut": operation.statut,
        }

    def _lot_pepiniere_dict(self, lot_pepiniere):
        if not lot_pepiniere:
            return None
        return {
            "id": lot_pepiniere.id,
            "code_lot": lot_pepiniere.code_lot,
            "date_entree": _as_date(lot_pepiniere.date_entree),
            "date_sortie_prevue": _as_date(lot_pepiniere.date_sortie_prevue),
            "date_sortie_reelle": _as_date(lot_pepiniere.date_sortie_reelle),
            "nombre_plants_initial": lot_pepiniere.nombre_plants_initial,
            "nombre_plants_valides": lot_pepiniere.nombre_plants_valides,
            "nombre_plants_rejetes": lot_pepiniere.nombre_plants_rejetes,
            "nombre_plants_morts": lot_pepiniere.nombre_plants_morts,
            "taille_moyenne_cm": _as_float(lot_pepiniere.taille_moyenne_cm),
            "nombre_feuilles_moyen": _as_float(lot_pepiniere.nombre_feuilles_moyen),
            "taux_survie": lot_pepiniere.taux_survie,
            "etat_sanitaire": lot_pepiniere.etat_sanitaire,
            "statut": lot_pepiniere.statut,
        }

    def _lot_semence_dict(self, lot_semence):
        if not lot_semence:
            return None
        return {
            "id": lot_semence.id,
            "code_lot": lot_semence.code_lot,
            "variete": lot_semence.variete,
            "fournisseur": lot_semence.fournisseur,
            "origine": lot_semence.origine,
            "certification": lot_semence.certification,
            "date_acquisition": _as_date(lot_semence.date_acquisition),
            "date_mise_en_germination": _as_date(lot_semence.date_mise_en_germination),
            "nombre_graines": lot_semence.nombre_graines,
            "nombre_graines_germees": lot_semence.nombre_graines_germees,
            "taux_germination": _as_float(lot_semence.taux_germination),
            "statut": lot_semence.statut,
        }

    def _suivi_croissance_dict(self, suivi):
        if not suivi:
            return None
        return {
            "id": suivi.id,
            "date_observation": _as_date(suivi.date_observation),
            "hauteur_moyenne_cm": _as_float(suivi.hauteur_moyenne_cm),
            "nombre_feuilles_moyen": _as_float(suivi.nombre_feuilles_moyen),
            "mortalite": suivi.mortalite,
            "plants_remplaces": suivi.plants_remplaces,
            "stress_hydrique": suivi.stress_hydrique,
            "etat_general": suivi.etat_general,
            "observations": suivi.observations,
        }

    def _observation_sanitaire_dict(self, observation):
        return {
            "id": observation.id,
            "date_observation": _as_date(observation.date_observation),
            "type_probleme": observation.type_probleme,
            "gravite": observation.gravite,
            "surface_touchee_ha": _as_float(observation.surface_touchee_ha),
            "action_recommandee": observation.action_recommandee,
            "action_effectuee": observation.action_effectuee,
            "statut": observation.statut,
        }
