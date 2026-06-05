"""
Commande à exécuter quotidiennement pour générer les alertes automatiques.
Configurer dans settings.py :
  CRONJOBS = [('0 6 * * *', 'django.core.management.call_command', ['check_alerts'])]
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Sum

from accounts.models import Notification
from accounts.utils import create_notification
from materiels.models import MaterielEquipement
from recoltes.models import FicheRecolteDetail
from secteurs.models import Secteur
from travaux.models import FicheTravaux

User = get_user_model()


def _admin_users():
    return User.objects.filter(profile__role="admin", is_active=True)


class Command(BaseCommand):
    help = "Vérifie les conditions d'alerte et crée les notifications."

    def handle(self, *args, **options):
        today = date.today()
        admins = list(_admin_users())
        if not admins:
            self.stdout.write("Aucun admin trouvé.")
            return

        nb = 0

        # 1. Stock matériel épuisé (quantite = 0)
        epuises = MaterielEquipement.objects.filter(quantite=0)
        for mat in epuises:
            msg = f"Stock épuisé : {mat.designation or mat.numero} (qté = 0)"
            for admin in admins:
                if not Notification.objects.filter(user=admin, message=msg, lu=False).exists():
                    create_notification(admin, msg, type="warning", lien="/materiels")
                    nb += 1

        # 2. Matériel en panne
        en_panne = MaterielEquipement.objects.filter(statut_utilisation__iexact="en_panne")
        for mat in en_panne:
            msg = f"Matériel en panne : {mat.designation or mat.numero}"
            for admin in admins:
                if not Notification.objects.filter(user=admin, message=msg, lu=False).exists():
                    create_notification(admin, msg, type="warning", lien="/materiels")
                    nb += 1

        # 3. Travaux en retard (date_fin < aujourd'hui et pas terminé)
        retards = FicheTravaux.objects.filter(
            date_fin__lt=today,
            statut_avancement__in=("planifie", "en_cours"),
        )
        for fiche in retards:
            ref = fiche.periode_travaux or f"#{fiche.id}"
            msg = f"Travaux en retard : {fiche.nature_travaux or 'N/A'} ({ref})"
            for admin in admins:
                if not Notification.objects.filter(user=admin, message=msg, lu=False).exists():
                    create_notification(admin, msg, type="warning", lien="/travaux")
                    nb += 1

        # 4. Objectif de production non atteint (mois courant, secteurs avec cible)
        month = today.month
        year = today.year
        secteurs_avec_cible = Secteur.objects.filter(
            rendement_cible_t_ha__isnull=False,
            statut="actif",
        )
        for secteur in secteurs_avec_cible:
            prod_mois = (
                FicheRecolteDetail.objects.filter(
                    secteur=secteur,
                    ligne__fiche__date__year=year,
                    ligne__fiche__date__month=month,
                ).aggregate(total=Sum("quantite"))["total"]
                or 0
            )
            # Seuil : cible mensuelle en régimes = rendement_cible_t_ha * superficie * 100
            # (approximation : 1 régime ≈ 10 kg → 1 t = 100 régimes)
            superficie = float(secteur.superficie_ha or 0)
            cible_t = float(secteur.rendement_cible_t_ha or 0)
            cible_regimes = cible_t * superficie * 100
            if cible_regimes > 0 and int(prod_mois) < int(cible_regimes * 0.5):
                msg = (
                    f"Objectif non atteint : secteur {secteur.code} — "
                    f"{prod_mois} régimes / cible {int(cible_regimes)}"
                )
                for admin in admins:
                    if not Notification.objects.filter(user=admin, message=msg, lu=False).exists():
                        create_notification(admin, msg, type="warning", lien="/secteurs")
                        nb += 1

        self.stdout.write(self.style.SUCCESS(f"{nb} notification(s) créée(s)."))
