from calendar import monthrange
from datetime import date

from plantations.services import ContexteAgronomiqueService


def _round(value, digits=2):
    if value is None:
        return None
    return round(float(value), digits)


class ContexteAgronomiquePrediction:
    """Prepare la memoire agronomique a joindre aux predictions IA."""

    def __init__(self):
        self.service = ContexteAgronomiqueService()

    def contexte_pour_prediction(self, secteur, annee, mois):
        date_reference = self._date_reference(annee, mois)
        contexte = self.service.construire_pour_secteur(secteur, date_reference)
        return self.resumer_contexte(contexte)

    def resumer_contextes_plantation(self, contextes):
        if not contextes:
            return {
                "scope": "plantation",
                "nb_secteurs": 0,
                "score_confiance_moyen": 0,
                "nb_secteurs_avec_alertes": 0,
                "nb_donnees_manquantes": 0,
                "secteurs_a_surveiller": [],
                "alertes": [],
                "lecture": "Aucun contexte agronomique disponible.",
            }

        scores = [
            ctx.get("scores", {}).get("confiance_contexte")
            for ctx in contextes
            if ctx.get("scores", {}).get("confiance_contexte") is not None
        ]
        secteurs_a_surveiller = []
        alertes = []
        nb_manquants = 0
        for ctx in contextes:
            secteur = ctx.get("secteur") or {}
            ctx_alertes = ctx.get("alertes") or []
            nb_manquants += len(ctx.get("donnees_manquantes") or [])
            if ctx_alertes:
                secteurs_a_surveiller.append({
                    "id": secteur.get("id"),
                    "code": secteur.get("code"),
                    "nom": secteur.get("nom"),
                    "score_confiance": ctx.get("scores", {}).get("confiance_contexte"),
                    "nb_alertes": len(ctx_alertes),
                })
                alertes.extend([
                    {**alerte, "secteur_code": secteur.get("code")}
                    for alerte in ctx_alertes[:2]
                ])

        score_moyen = sum(scores) / len(scores) if scores else 0
        resume = {
            "scope": "plantation",
            "nb_secteurs": len(contextes),
            "score_confiance_moyen": _round(score_moyen),
            "nb_secteurs_avec_alertes": len(secteurs_a_surveiller),
            "nb_donnees_manquantes": nb_manquants,
            "secteurs_a_surveiller": sorted(
                secteurs_a_surveiller,
                key=lambda item: (item.get("score_confiance") is None, item.get("score_confiance") or 0),
            )[:8],
            "alertes": alertes[:8],
        }
        resume["lecture"] = self._lecture_plantation(resume)
        return resume

    def resumer_contexte(self, contexte):
        secteur = contexte.get("secteur") or {}
        indicateurs = contexte.get("indicateurs") or {}
        scores = contexte.get("scores") or {}
        lot_semence = contexte.get("lot_semence") or {}
        lot_pepiniere = contexte.get("lot_pepiniere") or {}

        resume = {
            "scope": "secteur",
            "date_reference": contexte.get("date_reference"),
            "secteur": {
                "id": secteur.get("id"),
                "code": secteur.get("code"),
                "nom": secteur.get("nom"),
            },
            "origine": {
                "lot_semence": lot_semence.get("code_lot"),
                "variete": lot_semence.get("variete"),
                "fournisseur": lot_semence.get("fournisseur"),
                "certification": lot_semence.get("certification"),
                "lot_pepiniere": lot_pepiniere.get("code_lot"),
            },
            "indicateurs": {
                "age_plantation_mois": indicateurs.get("age_plantation_mois"),
                "age_estime_plants_mois": indicateurs.get("age_estime_plants_mois"),
                "densite_plantation": indicateurs.get("densite_plantation"),
                "taux_germination": indicateurs.get("taux_germination"),
                "taux_survie_pepiniere": indicateurs.get("taux_survie_pepiniere"),
                "mortalite_croissance_pct": indicateurs.get("mortalite_croissance_pct"),
                "nb_suivis_croissance": indicateurs.get("nb_suivis_croissance"),
                "nb_alertes_sanitaires_ouvertes": indicateurs.get("nb_alertes_sanitaires_ouvertes"),
            },
            "scores": {
                "origine": scores.get("origine"),
                "croissance": scores.get("croissance"),
                "sanitaire": scores.get("sanitaire"),
                "completude_donnees": scores.get("completude_donnees"),
                "confiance_contexte": scores.get("confiance_contexte"),
            },
            "donnees_manquantes": contexte.get("donnees_manquantes") or [],
        }
        resume["alertes"] = self._alertes(resume)
        resume["lecture"] = self._lecture_secteur(resume)
        return resume

    def _date_reference(self, annee, mois):
        annee = int(annee)
        mois = int(mois)
        if mois < 1 or mois > 12:
            raise ValueError("mois_cible doit etre compris entre 1 et 12.")
        return date(annee, mois, monthrange(annee, mois)[1])

    def _alertes(self, resume):
        indicateurs = resume.get("indicateurs") or {}
        scores = resume.get("scores") or {}
        manquantes = resume.get("donnees_manquantes") or []
        alertes = []

        def ajouter(niveau, code, message, action):
            alertes.append({
                "niveau": niveau,
                "code": code,
                "message": message,
                "action": action,
            })

        if "operation_plantation" in manquantes:
            ajouter(
                "critique",
                "origine_absente",
                "Aucune operation de plantation n'est reliee au secteur.",
                "Renseigner l'origine semence/pepiniere/plantation avant d'interpreter finement la prediction.",
            )
        elif manquantes:
            ajouter(
                "attention",
                "donnees_incompletes",
                f"{len(manquantes)} donnee(s) agronomique(s) manquante(s).",
                "Completer les donnees manquantes pour renforcer la confiance du contexte.",
            )

        confiance_contexte = scores.get("confiance_contexte")
        if confiance_contexte is not None and confiance_contexte < 60:
            ajouter(
                "attention",
                "confiance_contexte_faible",
                "La memoire agronomique du secteur reste peu complete.",
                "Utiliser la prediction comme indication et programmer un controle terrain.",
            )

        if (indicateurs.get("nb_alertes_sanitaires_ouvertes") or 0) > 0:
            ajouter(
                "attention",
                "sanitaire_ouvert",
                f"{indicateurs.get('nb_alertes_sanitaires_ouvertes')} alerte(s) sanitaire(s) ouverte(s).",
                "Traiter ou documenter les observations sanitaires avant la prochaine recolte.",
            )

        mortalite_pct = indicateurs.get("mortalite_croissance_pct")
        if mortalite_pct is not None and mortalite_pct >= 5:
            ajouter(
                "attention",
                "mortalite_croissance",
                f"Mortalite observee estimee a {mortalite_pct:.1f}%.",
                "Verifier les manquants, les remplacements et l'etat des jeunes plants.",
            )

        taux_germination = indicateurs.get("taux_germination")
        if taux_germination is not None and taux_germination < 75:
            ajouter(
                "attention",
                "germination_faible",
                f"Taux de germination faible ({taux_germination:.1f}%).",
                "Comparer le lot avec les autres origines avant de le generaliser.",
            )

        taux_survie = indicateurs.get("taux_survie_pepiniere")
        if taux_survie is not None and taux_survie < 85:
            ajouter(
                "attention",
                "survie_pepiniere_faible",
                f"Taux de survie pepiniere faible ({taux_survie:.1f}%).",
                "Analyser les pertes pepiniere et les causes de rejet.",
            )

        return alertes

    def _lecture_secteur(self, resume):
        score = resume.get("scores", {}).get("confiance_contexte")
        alertes = resume.get("alertes") or []
        if score is None:
            return "Prediction calculee sans memoire agronomique complete du secteur."
        if any(a.get("niveau") == "critique" for a in alertes):
            return "Prediction a interpreter prudemment : l'origine agronomique du secteur est incomplete."
        if alertes:
            return "Prediction enrichie par le contexte agronomique, avec quelques points a surveiller."
        if score >= 80:
            return "Prediction appuyee par une memoire agronomique coherente."
        return "Prediction exploitable, mais la memoire agronomique peut encore etre completee."

    def _lecture_plantation(self, resume):
        score = resume.get("score_confiance_moyen") or 0
        alertes = resume.get("nb_secteurs_avec_alertes") or 0
        if not resume.get("nb_secteurs"):
            return "Aucun secteur disponible pour consolider le contexte agronomique."
        if alertes:
            return f"Prediction consolidee avec {alertes} secteur(s) a surveiller sur le plan agronomique."
        if score >= 80:
            return "Prediction consolidee sur une memoire agronomique globalement coherente."
        return "Prediction consolidee, mais plusieurs donnees agronomiques restent a completer."
