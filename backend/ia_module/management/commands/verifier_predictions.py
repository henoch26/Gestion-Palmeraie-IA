"""
Commande Django : renseigne valeur_reelle sur les Prediction passées, une fois
que leur période cible dispose de fiches de récolte validées.

Usage : python manage.py verifier_predictions
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Compare les prédictions passées à la production réellement enregistrée depuis"

    def handle(self, *args, **options):
        from datetime import date
        from decimal import Decimal
        from django.db.models import Sum
        from ia_module.models import Prediction
        from recoltes.models import FicheRecolteDetail

        aujourdhui = date.today()
        annee_courante, mois_courant = aujourdhui.year, aujourdhui.month

        a_verifier = Prediction.objects.filter(valeur_reelle__isnull=True, secteur__isnull=False)
        renseignees = 0
        en_attente = 0

        for prediction in a_verifier:
            annee, mois = prediction.annee_cible, prediction.mois_cible

            # Ne pas comparer à un mois en cours ou futur : la production ne
            # serait que partielle, ce qui donnerait l'illusion d'un gros écart
            # alors que le mois n'est simplement pas terminé.
            if mois is not None:
                if (annee, mois) >= (annee_courante, mois_courant):
                    en_attente += 1
                    continue
                filtres = {
                    "ligne__fiche__date__year": annee,
                    "ligne__fiche__date__month": mois,
                }
            else:
                if annee >= annee_courante:
                    en_attente += 1
                    continue
                filtres = {"ligne__fiche__date__year": annee}

            reel = (
                FicheRecolteDetail.objects
                .filter(
                    ligne__fiche__statut="valide",
                    secteur_id=prediction.secteur_id,
                    **filtres,
                )
                .aggregate(total=Sum("quantite"))["total"]
            )
            if reel is None:
                en_attente += 1
                continue

            prediction.valeur_reelle = Decimal(str(reel))
            prediction.save(update_fields=["valeur_reelle"])
            renseignees += 1

        self.stdout.write(self.style.SUCCESS(
            f"{renseignees} prédiction(s) renseignée(s) avec la production réelle "
            f"({en_attente} encore en attente d'une période terminée ou de fiches validées)."
        ))
