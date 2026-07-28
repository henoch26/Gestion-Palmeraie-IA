"""
ia_module/views.py - Endpoints API du module IA.

Expose deux niveaux d'API :
- endpoints techniques admin : entraînement, détection avancée, modèles ;
- endpoints métier : synthèse, simulation, prescriptions, prédiction lisible.
"""
import decimal
import logging

from django.db import OperationalError, ProgrammingError
from django.db.models import Avg
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from utils.permissions import IsAdmin, IsIARole
from .models import Anomalie, DonneeMeteo, ModeleIA, Prediction, Prescription
from .serializers import (
    AnomalieSerializer,
    DonneeMeteoSerializer,
    ModeleIASerializer,
    PredictionSerializer,
    PrescriptionSerializer,
)

logger = logging.getLogger(__name__)


def _is_admin(user):
    try:
        return user.profile.is_admin
    except AttributeError:
        return False


def _latest_regression_model(algorithme=None):
    """
    Renvoie le modèle de régression actif avec le meilleur R² — pas le plus
    récemment entraîné. Auparavant `.latest("date_entrainement")` : ça
    fonctionnait "par chance" (random_forest est toujours entraîné juste
    après linear_regression dans `entrainer_modeles`, donc plus récent),
    mais rien ne garantissait qu'il s'agisse réellement du meilleur modèle —
    un ré-entraînement isolé de linear_regression seul aurait silencieusement
    servi le modèle le plus faible aux utilisateurs non-admin.
    """
    qs = ModeleIA.objects.filter(type_tache="regression", actif=True)
    if algorithme:
        qs = qs.filter(algorithme=algorithme)
    modeles = list(qs)
    if not modeles:
        raise ModeleIA.DoesNotExist()
    return max(modeles, key=lambda m: (m.metriques or {}).get("r2", float("-inf")))


def _meteo_prediction_context(secteur_id, annee_cible, mois_cible):
    """Retourne une meteo exploitable pour une prediction sectorielle."""
    meteo = DonneeMeteo.objects.filter(
        secteur_id=secteur_id,
        date__year=annee_cible,
        date__month=mois_cible,
    ).aggregate(
        temp_moy=Avg("temperature_moy"),
        precip=Avg("precipitation_mm"),
        humid=Avg("humidite_pct"),
    )
    if meteo.get("temp_moy") is None:
        meteo = DonneeMeteo.objects.filter(
            secteur_id=secteur_id,
            date__month=mois_cible,
        ).aggregate(
            temp_moy=Avg("temperature_moy"),
            precip=Avg("precipitation_mm"),
            humid=Avg("humidite_pct"),
        )
    return {
        "temperature_moy": float(meteo.get("temp_moy") or 27),
        "precipitation_mm": float(meteo.get("precip") or 100),
        "humidite_pct": float(meteo.get("humid") or 75),
    }


def _feedback_apprentissage(anomalie, user, decision, label):
    """Stocke la decision humaine pour enrichir les futurs labels d'entrainement."""
    details = dict(anomalie.details or {})
    event = {
        "decision": decision,
        "label_apprentissage": int(label),
        "utilisateur": getattr(user, "username", None),
        "date": timezone.now().isoformat(),
    }
    historique = list(details.get("feedback_humain_historique") or [])
    historique.append(event)
    details["feedback_humain"] = event
    details["feedback_humain_historique"] = historique[-10:]
    anomalie.details = details

@api_view(["GET"])
@permission_classes([IsIARole])
def synthese_metier_view(request):
    """Synthèse IA orientée décisions, recommandations et priorités par rôle."""
    from .services.intelligence_metier import IntelligenceMetier

    year = request.query_params.get("year")
    try:
        service = IntelligenceMetier(request.user)
        return Response(service.build_synthese(year=year))
    except Exception as exc:
        logger.exception("Erreur synthèse métier IA")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsIARole])
def simulation_view(request):
    """Simule un scénario opérationnel sans exposer les algorithmes."""
    from .services.intelligence_metier import IntelligenceMetier

    service = IntelligenceMetier(request.user)
    try:
        return Response(service.simuler(request.data))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Erreur simulation IA")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET", "POST"])
@permission_classes([IsIARole])
def prescriptions_view(request):
    """Liste ou crée des prescriptions opérationnelles IA."""
    from .services.intelligence_metier import IntelligenceMetier

    if request.method == "GET":
        try:
            qs = Prescription.objects.select_related("secteur", "created_by").order_by("-created_at")
            if not _is_admin(request.user):
                qs = qs.filter(created_by=request.user)
            return Response(PrescriptionSerializer(qs[:100], many=True).data)
        except (OperationalError, ProgrammingError):
            logger.exception("Table des prescriptions IA indisponible")
            return Response(
                {"detail": "La table des recommandations IA n'est pas encore disponible. Appliquez les migrations."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    service = IntelligenceMetier(request.user)
    try:
        prescription = service.creer_prescription(request.data)
        return Response(PrescriptionSerializer(prescription).data, status=status.HTTP_201_CREATED)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Erreur prescription IA")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([IsIARole])
def risques_secteurs_view(request):
    """Retourne le scoring explicable des risques par secteur."""
    from secteurs.models import Secteur
    from .services.aide_decisionnelle import AideDecisionnelleIA

    service = AideDecisionnelleIA(request.user)
    year = request.query_params.get("year")
    limit = request.query_params.get("limit")
    secteur_id = request.query_params.get("secteur_id")

    try:
        if secteur_id:
            secteur = Secteur.objects.get(pk=int(secteur_id))
            return Response(service.analyser_secteur(secteur, year=year))

        rows = service.scores_secteurs(year=year, limit=int(limit) if limit else None)
        return Response({
            "annee": int(year) if year else timezone.now().year,
            "resume": service.resume_risque(rows),
            "total": len(rows),
            "secteurs": rows,
        })
    except Secteur.DoesNotExist:
        return Response({"detail": "Secteur introuvable."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        logger.exception("Erreur scoring risque secteur")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsIARole])
def plan_equipe_view(request):
    """Propose une planification intelligente des recolteurs pour un secteur."""
    from secteurs.models import Secteur
    from .services.aide_decisionnelle import AideDecisionnelleIA

    secteur_id = request.data.get("secteur_id")
    if not secteur_id:
        return Response({"detail": "secteur_id est requis."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        secteur = Secteur.objects.get(pk=int(secteur_id))
    except Secteur.DoesNotExist:
        return Response({"detail": "Secteur introuvable."}, status=status.HTTP_404_NOT_FOUND)

    service = AideDecisionnelleIA(request.user)
    try:
        plan = service.planifier_equipe(
            secteur=secteur,
            year=request.data.get("annee_cible"),
            month=request.data.get("mois_cible"),
            objectif_regimes=request.data.get("objectif_regimes"),
        )
        return Response({"secteur": {"id": secteur.id, "code": secteur.code, "nom": secteur.nom}, "plan": plan})
    except Exception as exc:
        logger.exception("Erreur planification equipe IA")
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([IsAdmin])
def entrainer_view(request):
    """
    Entraîne les modèles ML demandés.
    Corps : {"algorithmes": ["linear_regression", "random_forest", ...]}
    ou {} pour entraîner tous les moteurs disponibles.
    """
    from .services.detecteur_anomalies import DetecteurAnomalies
    from .services.predicteur_rendement import PredicteurRendement

    algorithmes = request.data.get("algorithmes") or [
        "linear_regression", "random_forest",
        "decision_tree", "logistic_regression", "isolation_forest",
    ]

    predicteur = PredicteurRendement()
    detecteur = DetecteurAnomalies()

    trainers = {
        "linear_regression": lambda: predicteur.entrainer_regression_lineaire(user=request.user),
        "random_forest": lambda: predicteur.entrainer_random_forest(user=request.user),
        "decision_tree": lambda: detecteur.entrainer_decision_tree(user=request.user),
        "logistic_regression": lambda: detecteur.entrainer_logistic_regression(user=request.user),
        "isolation_forest": lambda: detecteur.entrainer_isolation_forest(user=request.user),
    }

    results = []
    errors = []
    for algo in algorithmes:
        if algo not in trainers:
            errors.append({"algorithme": algo, "erreur": "Algorithme inconnu."})
            continue
        try:
            modele = trainers[algo]()
            results.append(ModeleIASerializer(modele).data)
        except Exception as exc:
            logger.exception("Erreur entraînement %s", algo)
            errors.append({"algorithme": algo, "erreur": str(exc)})

    return Response({"modeles_entraines": results, "erreurs": errors, "total": len(results)})


@api_view(["GET"])
@permission_classes([IsIARole])
def evaluation_modeles_view(request):
    """Evalue les modeles de rendement sur un jeu de test temporel independant."""
    from .services.evaluation_modeles import EvaluationModeles
    from django.core.cache import cache

    algorithmes = (
        request.query_params.get("algorithmes")
        or request.query_params.get("algorithme")
        or None
    )
    test_start = (
        request.query_params.get("test_start")
        or request.query_params.get("debut_test")
        or "2024-01"
    )
    test_end = request.query_params.get("test_end") or request.query_params.get("fin_test") or None

    force_refresh = str(request.query_params.get("refresh", "")).lower() in ("1", "true", "yes")
    cache_key = f"ia:evaluation_modeles:{algorithmes or 'default'}:{test_start}:{test_end or 'auto'}"
    if not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

    try:
        rapport = EvaluationModeles().evaluer_rendement(
            algorithmes=algorithmes,
            test_start=test_start,
            test_end=test_end,
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Erreur evaluation modeles IA")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    cache.set(cache_key, rapport, 60 * 30)
    return Response(rapport)

@api_view(["POST"])
@permission_classes([IsIARole])
def predire_rendement_view(request):
    """
    Effectue une prédiction de rendement.
    Pour les non-admins, le meilleur moteur actif est choisi automatiquement.
    """
    from secteurs.models import Secteur
    from .services.contexte_agronomique_prediction import ContexteAgronomiquePrediction
    from .services.predicteur_rendement import PredicteurRendement
    from .services.variables_agronomiques import VariablesAgronomiquesService

    data = request.data
    secteur_id = data.get("secteur_id")
    annee_cible = data.get("annee_cible")
    mois_cible = data.get("mois_cible")
    algorithme = data.get("algorithme") if _is_admin(request.user) else None

    if not all([secteur_id, annee_cible, mois_cible]):
        return Response(
            {"detail": "secteur_id, annee_cible et mois_cible sont requis."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        secteur = Secteur.objects.get(pk=secteur_id)
    except Secteur.DoesNotExist:
        return Response({"detail": "Secteur introuvable."}, status=status.HTTP_404_NOT_FOUND)

    meteo = DonneeMeteo.objects.filter(
        secteur_id=secteur_id,
        date__year=annee_cible,
        date__month=mois_cible,
    ).aggregate(
        temp_moy=Avg("temperature_moy"),
        precip=Avg("precipitation_mm"),
        humid=Avg("humidite_pct"),
    )
    # Mois réellement futur : aucune donnée exacte n'existe encore. On retombe
    # sur la moyenne SAISONNIÈRE réelle du secteur pour ce mois (toutes années
    # confondues) plutôt que sur une constante fixe (27°C/100mm/75%), qui ne
    # reflète pas la saisonnalité réelle — vérifié empiriquement pour août à
    # Dabou/Kpass : ~3mm de pluie en réalité contre 100mm supposés par défaut.
    if meteo.get("temp_moy") is None:
        meteo = DonneeMeteo.objects.filter(
            secteur_id=secteur_id,
            date__month=mois_cible,
        ).aggregate(
            temp_moy=Avg("temperature_moy"),
            precip=Avg("precipitation_mm"),
            humid=Avg("humidite_pct"),
        )

    try:
        modele_ia = _latest_regression_model(algorithme=algorithme)
    except ModeleIA.DoesNotExist:
        return Response(
            {"detail": "Aucun moteur de prédiction actif. Lancez d'abord l'optimisation IA."},
            status=status.HTTP_404_NOT_FOUND,
        )

    predicteur = PredicteurRendement()
    contexte_service = ContexteAgronomiquePrediction()
    variables_service = VariablesAgronomiquesService()
    try:
        variables_agronomiques = variables_service.features_pour_secteur(
            secteur, int(annee_cible), int(mois_cible)
        )
        result = predicteur.predire(
            modele_ia=modele_ia,
            secteur_id=int(secteur_id),
            annee=int(annee_cible),
            mois=int(mois_cible),
            superficie_ha=float(secteur.superficie_ha or data.get("superficie_ha", 10)),
            age_moyen_plants=float(secteur.age_moyen_plants or data.get("age_moyen_plants", 10)),
            nb_palmiers=float(secteur.nb_palmiers or data.get("nb_palmiers", 200)),
            rendement_cible=float(secteur.rendement_cible_t_ha or data.get("rendement_cible", 15)),
            temperature_moy=float(meteo.get("temp_moy") or data.get("temperature_moy", 27)),
            precipitation_mm=float(meteo.get("precip") or data.get("precipitation_mm", 100)),
            humidite_pct=float(meteo.get("humid") or data.get("humidite_pct", 75)),
            **variables_agronomiques,
        )
        contexte_agronomique = contexte_service.contexte_pour_prediction(
            secteur, int(annee_cible), int(mois_cible)
        )
        features_prediction = {
            **result["features"],
            "contexte_agronomique": contexte_agronomique,
        }
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Erreur de prédiction")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    prediction = Prediction.objects.create(
        modele=modele_ia,
        secteur=secteur,
        annee_cible=int(annee_cible),
        mois_cible=int(mois_cible),
        valeur_predite=decimal.Decimal(str(result["valeur_predite"])),
        intervalle_bas=decimal.Decimal(str(result["intervalle_bas"])),
        intervalle_haut=decimal.Decimal(str(result["intervalle_haut"])),
        features_utilisees=features_prediction,
        created_by=request.user,
    )

    from .services.aide_decisionnelle import AideDecisionnelleIA
    from .services.ml_pipeline import OBJECTIF_R2_MEMOIRE, niveau_fiabilite
    decision = AideDecisionnelleIA(request.user)
    serializer = PredictionSerializer(prediction)

    r2 = modele_ia.metriques.get("r2")
    fiabilite = {
        "r2": r2,
        "objectif_memoire": OBJECTIF_R2_MEMOIRE,
        "niveau": niveau_fiabilite(r2),
    }

    return Response(
        {
            "prediction": serializer.data,
            "modele": ModeleIASerializer(modele_ia).data if _is_admin(request.user) else None,
            "fiabilite": fiabilite,
            "lecture_metier": serializer.data.get("lecture_metier"),
            "explication": decision.expliquer_prediction(prediction),
            "contexte_agronomique": contexte_agronomique,
            "alertes_agronomiques": contexte_agronomique.get("alertes", []),
            "plan_equipe": decision.planifier_equipe(
                secteur=secteur,
                year=int(annee_cible),
                month=int(mois_cible),
                objectif_regimes=result["valeur_predite"],
            ),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsIARole])
def predire_plantation_view(request):
    """Effectue et persiste une prediction consolidee pour toute la plantation."""
    from secteurs.models import Secteur
    from .services.aide_decisionnelle import AideDecisionnelleIA
    from .services.contexte_agronomique_prediction import ContexteAgronomiquePrediction
    from .services.ml_pipeline import OBJECTIF_R2_MEMOIRE, niveau_fiabilite
    from .services.predicteur_rendement import PredicteurRendement
    from .services.variables_agronomiques import VariablesAgronomiquesService

    data = request.data
    annee_cible = data.get("annee_cible")
    mois_cible = data.get("mois_cible")
    algorithme = data.get("algorithme") if _is_admin(request.user) else None

    if not all([annee_cible, mois_cible]):
        return Response(
            {"detail": "annee_cible et mois_cible sont requis."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    secteurs = list(Secteur.objects.all().order_by("code"))
    if not secteurs:
        return Response({"detail": "Aucun secteur disponible pour la prediction plantation."}, status=status.HTTP_404_NOT_FOUND)

    try:
        modele_ia = _latest_regression_model(algorithme=algorithme)
    except ModeleIA.DoesNotExist:
        return Response(
            {"detail": "Aucun moteur de prediction actif. Lancez d'abord l'optimisation IA."},
            status=status.HTTP_404_NOT_FOUND,
        )

    predicteur = PredicteurRendement()
    contexte_service = ContexteAgronomiquePrediction()
    variables_service = VariablesAgronomiquesService()
    sector_rows = []
    total = 0.0
    low = 0.0
    high = 0.0
    surfaces = []
    ages = []
    ages_reels_plantation = []
    ages_reels_plants = []
    pluies_3 = []
    pluies_6 = []
    humidites_3 = []
    temperatures_3 = []
    palmiers = []
    cibles = []
    meteo_rows = []
    contextes_agronomiques = []

    try:
        for secteur in secteurs:
            meteo = _meteo_prediction_context(secteur.id, int(annee_cible), int(mois_cible))
            variables_agronomiques = variables_service.features_pour_secteur(
                secteur, int(annee_cible), int(mois_cible)
            )
            result = predicteur.predire(
                modele_ia=modele_ia,
                secteur_id=int(secteur.id),
                annee=int(annee_cible),
                mois=int(mois_cible),
                superficie_ha=float(secteur.superficie_ha or data.get("superficie_ha", 10)),
                age_moyen_plants=float(secteur.age_moyen_plants or data.get("age_moyen_plants", 10)),
                nb_palmiers=float(secteur.nb_palmiers or data.get("nb_palmiers", 200)),
                rendement_cible=float(secteur.rendement_cible_t_ha or data.get("rendement_cible", 15)),
                temperature_moy=meteo["temperature_moy"],
                precipitation_mm=meteo["precipitation_mm"],
                humidite_pct=meteo["humidite_pct"],
                **variables_agronomiques,
            )
            valeur = float(result["valeur_predite"])
            bas = float(result["intervalle_bas"])
            haut = float(result["intervalle_haut"])
            total += valeur
            low += bas
            high += haut
            features = result.get("features", {})
            contexte_agronomique = contexte_service.contexte_pour_prediction(
                secteur, int(annee_cible), int(mois_cible)
            )
            features["contexte_agronomique"] = contexte_agronomique
            contextes_agronomiques.append(contexte_agronomique)
            surfaces.append(float(features.get("superficie_ha") or 0))
            ages.append(float(features.get("age_moyen_plants") or 0))
            ages_reels_plantation.append(float(features.get("age_reel_plantation_mois") or 0))
            ages_reels_plants.append(float(features.get("age_reel_plants_mois") or 0))
            pluies_3.append(float(features.get("pluie_cumulee_3_mois") or 0))
            pluies_6.append(float(features.get("pluie_cumulee_6_mois") or 0))
            humidites_3.append(float(features.get("humidite_moyenne_3_mois") or 0))
            temperatures_3.append(float(features.get("temperature_moyenne_3_mois") or 0))
            palmiers.append(float(features.get("nb_palmiers") or 0))
            cibles.append(float(features.get("rendement_cible") or 0))
            meteo_rows.append(meteo)
            sector_rows.append({
                "secteur": {"id": secteur.id, "code": secteur.code, "nom": secteur.nom},
                "valeur_predite": round(valeur, 2),
                "intervalle_bas": round(bas, 2),
                "intervalle_haut": round(haut, 2),
                "features": features,
            })
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.exception("Erreur de prediction plantation")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _avg(values, fallback=0):
        rows = [float(v) for v in values if v is not None]
        return sum(rows) / len(rows) if rows else fallback

    contexte_global = contexte_service.resumer_contextes_plantation(contextes_agronomiques)

    features_globales = {
        "scope": "plantation",
        "annee": int(annee_cible),
        "mois": int(mois_cible),
        "nb_secteurs": len(sector_rows),
        "superficie_ha": round(sum(surfaces), 2),
        "age_moyen_plants": round(_avg(ages, 10), 2),
        "age_reel_plantation_mois": round(_avg(ages_reels_plantation, 120), 2),
        "age_reel_plants_mois": round(_avg(ages_reels_plants, 120), 2),
        "nb_palmiers": round(sum(palmiers), 2),
        "rendement_cible": round(_avg(cibles, 15), 2),
        "temperature_moy": round(_avg([m["temperature_moy"] for m in meteo_rows], 27), 2),
        "precipitation_mm": round(_avg([m["precipitation_mm"] for m in meteo_rows], 100), 2),
        "humidite_pct": round(_avg([m["humidite_pct"] for m in meteo_rows], 75), 2),
        "pluie_cumulee_3_mois": round(_avg(pluies_3, 300), 2),
        "pluie_cumulee_6_mois": round(_avg(pluies_6, 600), 2),
        "humidite_moyenne_3_mois": round(_avg(humidites_3, 75), 2),
        "temperature_moyenne_3_mois": round(_avg(temperatures_3, 27), 2),
        "contexte_agronomique": contexte_global,
        "secteurs": sector_rows,
    }

    prediction = Prediction.objects.create(
        modele=modele_ia,
        secteur=None,
        annee_cible=int(annee_cible),
        mois_cible=int(mois_cible),
        valeur_predite=decimal.Decimal(str(round(total, 2))),
        intervalle_bas=decimal.Decimal(str(round(low, 2))),
        intervalle_haut=decimal.Decimal(str(round(high, 2))),
        features_utilisees=features_globales,
        created_by=request.user,
    )

    r2 = modele_ia.metriques.get("r2")
    fiabilite = {
        "r2": r2,
        "objectif_memoire": OBJECTIF_R2_MEMOIRE,
        "niveau": niveau_fiabilite(r2),
    }
    serializer = PredictionSerializer(prediction)
    return Response({
        "prediction": serializer.data,
        "modele": ModeleIASerializer(modele_ia).data if _is_admin(request.user) else None,
        "fiabilite": fiabilite,
        "lecture_metier": serializer.data.get("lecture_metier"),
        "explication": AideDecisionnelleIA(request.user).expliquer_prediction(prediction),
        "contexte_agronomique": contexte_global,
        "alertes_agronomiques": contexte_global.get("alertes", []),
        "predictions_secteurs": sector_rows,
    }, status=status.HTTP_201_CREATED)

@api_view(["POST"])
@permission_classes([IsAdmin])
def detecter_anomalie_view(request):
    """Lance la détection d'anomalies par analyse métier ou avancée."""
    from .services.detecteur_anomalies import DetecteurAnomalies

    methode = request.data.get("methode", "regles_metier")
    fiche_id = request.data.get("fiche_id")
    detecteur = DetecteurAnomalies()

    try:
        if methode == "regles_metier":
            anomalies = detecteur.detecter_par_regles()
        elif methode == "isolation_forest":
            modele_ia = ModeleIA.objects.filter(algorithme="isolation_forest", actif=True).latest("date_entrainement")
            anomalies = detecteur.detecter_par_isolation_forest(modele_ia, fiche_recolte_id=fiche_id)
        elif methode == "residu_prediction":
            modele_ia = ModeleIA.objects.filter(algorithme="random_forest", actif=True).latest("date_entrainement")
            anomalies = detecteur.detecter_par_residu_prediction(modele_ia)
        else:
            return Response({"detail": "Méthode inconnue."}, status=status.HTTP_400_BAD_REQUEST)
    except ModeleIA.DoesNotExist:
        return Response({"detail": "Aucun moteur avancé de détection n'est actif."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as exc:
        logger.exception("Erreur détection anomalies")
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({
        "anomalies_detectees": AnomalieSerializer(anomalies, many=True).data,
        "total": len(anomalies),
        "methode": methode,
    })


class ModeleIAViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsIARole]
    serializer_class = ModeleIASerializer
    queryset = ModeleIA.objects.all().order_by("-date_entrainement")

    def get_queryset(self):
        qs = super().get_queryset()
        actif = self.request.query_params.get("actif")
        algo = self.request.query_params.get("algorithme")
        if actif is not None:
            qs = qs.filter(actif=actif.lower() == "true")
        if algo:
            qs = qs.filter(algorithme=algo)
        return qs


class PredictionViewSet(viewsets.ModelViewSet):
    serializer_class = PredictionSerializer

    def get_queryset(self):
        qs = Prediction.objects.select_related("modele", "secteur", "recolteur", "created_by").order_by("-date_prediction")
        secteur_id = self.request.query_params.get("secteur")
        annee = self.request.query_params.get("annee")
        if secteur_id:
            qs = qs.filter(secteur_id=secteur_id)
        if annee:
            qs = qs.filter(annee_cible=annee)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdmin()]
        return [IsIARole()]

    @action(detail=True, methods=["get"], url_path="expliquer")
    def expliquer(self, request, pk=None):
        from .services.aide_decisionnelle import AideDecisionnelleIA

        prediction = self.get_object()
        return Response(AideDecisionnelleIA(request.user).expliquer_prediction(prediction))


class AnomaliePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class AnomalieViewSet(viewsets.ModelViewSet):
    serializer_class = AnomalieSerializer
    pagination_class = AnomaliePagination

    def get_queryset(self):
        qs = Anomalie.objects.select_related("secteur", "recolteur", "fiche_recolte", "validated_by").order_by("-created_at", "-id")
        statut = self.request.query_params.get("statut")
        criticite = self.request.query_params.get("criticite")
        type_ano = self.request.query_params.get("type_anomalie")
        secteur_id = self.request.query_params.get("secteur")
        if statut:
            qs = qs.filter(statut=statut)
        if criticite:
            qs = qs.filter(criticite=criticite)
        if type_ano:
            qs = qs.filter(type_anomalie=type_ano)
        if secteur_id:
            qs = qs.filter(secteur_id=secteur_id)
        return qs

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "valider", "rejeter"):
            return [IsAdmin()]
        return [IsIARole()]

    @action(detail=True, methods=["post"], url_path="valider")
    def valider(self, request, pk=None):
        anomalie = self.get_object()
        if anomalie.statut != "nouvelle":
            return Response({"detail": "Seule une anomalie nouvelle peut être validée."}, status=400)
        anomalie.statut = "validee"
        anomalie.validated_by = request.user
        anomalie.validated_at = timezone.now()
        _feedback_apprentissage(anomalie, request.user, "validee", 1)
        anomalie.save(update_fields=["statut", "validated_by", "validated_at", "details"])
        return Response(self.get_serializer(anomalie).data)

    @action(detail=True, methods=["post"], url_path="rejeter")
    def rejeter(self, request, pk=None):
        anomalie = self.get_object()
        if anomalie.statut != "nouvelle":
            return Response({"detail": "Seule une anomalie nouvelle peut être rejetée."}, status=400)
        anomalie.statut = "rejetee"
        anomalie.validated_by = request.user
        anomalie.validated_at = timezone.now()
        _feedback_apprentissage(anomalie, request.user, "rejetee", 0)
        anomalie.save(update_fields=["statut", "validated_by", "validated_at", "details"])
        return Response(self.get_serializer(anomalie).data)


class DonneeMeteoViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsIARole]
    serializer_class = DonneeMeteoSerializer
    queryset = DonneeMeteo.objects.select_related("secteur").order_by("-date")

    def get_queryset(self):
        qs = super().get_queryset()
        secteur_id = self.request.query_params.get("secteur")
        annee = self.request.query_params.get("annee")
        mois = self.request.query_params.get("mois")
        if secteur_id:
            qs = qs.filter(secteur_id=secteur_id)
        if annee:
            qs = qs.filter(date__year=annee)
        if mois:
            qs = qs.filter(date__month=mois)
        return qs
