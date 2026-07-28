"""
Commande Django : récupère et stocke les données météo.

Usages :
  python manage.py fetch_meteo                         # hier, secteur global
  python manage.py fetch_meteo --date 2024-06-01       # un jour précis
  python manage.py fetch_meteo --depuis 2024-01-01     # plage complète (1 appel API)
  python manage.py fetch_meteo --depuis 2024-01-01 --tous-secteurs  # + chaque secteur actif
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Récupère et stocke les données météo depuis Open-Meteo"

    def add_arguments(self, parser):
        parser.add_argument("--date",   type=str, help="Date cible unique (YYYY-MM-DD)")
        parser.add_argument("--depuis", type=str, help="Date de début pour import historique (YYYY-MM-DD)")
        parser.add_argument(
            "--tous-secteurs", action="store_true",
            help="Avec --depuis : récupère aussi la météo pour chaque secteur actif"
        )

    def handle(self, *args, **options):
        from ia_module.services.meteo_service import MeteoService
        from datetime import date, datetime, timedelta

        service = MeteoService()

        # ── Mode --depuis : import historique batch ───────────────────
        if options.get("depuis"):
            date_debut = datetime.strptime(options["depuis"], "%Y-%m-%d").date()
            date_fin   = date.today() - timedelta(days=1)

            if date_debut > date_fin:
                self.stderr.write(self.style.ERROR("La date de début est dans le futur."))
                return

            nb_jours = (date_fin - date_debut).days + 1
            self.stdout.write(f"Import météo du {date_debut} au {date_fin} ({nb_jours} jours)…")

            results = service.fetch_and_store_range(date_debut, date_fin, secteur=None)
            self.stdout.write(self.style.SUCCESS(
                f"  Données globales : {len(results)} enregistrement(s) sauvegardé(s)."
            ))

            total_sec = 0
            if options.get("tous_secteurs"):
                from secteurs.models import Secteur
                secteurs = list(Secteur.objects.filter(statut="actif"))
                self.stdout.write(f"  Traitement de {len(secteurs)} secteur(s) actif(s)…")
                for secteur in secteurs:
                    try:
                        r = service.fetch_and_store_range(date_debut, date_fin, secteur=secteur)
                        total_sec += len(r)
                        self.stdout.write(f"    {secteur.code} : {len(r)} enregistrement(s)")
                    except Exception as exc:
                        self.stderr.write(f"    {secteur.code} : ERREUR — {exc}")
                self.stdout.write(self.style.SUCCESS(
                    f"  Secteurs : {total_sec} enregistrement(s) sauvegardé(s)."
                ))

            total = len(results) + total_sec
            self.stdout.write(self.style.SUCCESS(f"Import terminé. Total : {total} enregistrement(s)."))
            return

        # ── Mode --date ou sans argument : un seul jour ───────────────
        target = None
        if options.get("date"):
            target = datetime.strptime(options["date"], "%Y-%m-%d").date()

        try:
            results = service.fetch_all_secteurs_today() if not target else [
                service.fetch_and_store(target)
            ]
            self.stdout.write(
                self.style.SUCCESS(f"{len(results)} enregistrement(s) météo sauvegardé(s).")
            )
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Erreur : {exc}"))
