from datetime import timedelta
import random

from django.core.management.base import BaseCommand
from django.utils import timezone

from secteurs.models import Secteur
from recolteurs.models import Recolteur
from recoltes.models import (
    FicheRecolte,
    SuperviseurAdjoint,
    FicheRecolteLigne,
    FicheRecolteDetail,
    FicheRecuVente,
)


class Command(BaseCommand):
    help = "Insere des donnees de depart (secteurs, recolteurs, fiches)"

    def handle(self, *args, **options):
        # Seed deterministe pour obtenir les memes donnees a chaque execution
        random.seed(42)

        # 1) Secteurs (codes fixes)
        secteurs_data = [
            {"code": "GP_1", "nom": "GP 1", "superficie_ha": 7.47, "relief": "Plateau", "sol": "Sableux / Argileux"},
            {"code": "GP_2", "nom": "GP 2", "superficie_ha": 4.60, "relief": "Plateau / Pentus", "sol": "Argileux / Gravillonnaire"},
            {"code": "RTE_BOUB", "nom": "Rte Boub", "superficie_ha": 1.90, "relief": "Plateau", "sol": "Argileux"},
            {"code": "PM_1", "nom": "PM 1", "superficie_ha": 3.48, "relief": "Plateau / Pentus", "sol": "Gravillonnaire / Argileux / Sableux"},
            {"code": "PM_2", "nom": "PM 2", "superficie_ha": 4.44, "relief": "Pentus - Plateau", "sol": "Humifere - Argileux"},
            {"code": "JC_1", "nom": "JC 1", "superficie_ha": 6.80, "relief": "Pentus - Plateau", "sol": "Sableux - Humifere"},
            {"code": "JC_2", "nom": "JC 2", "superficie_ha": 1.17, "relief": "Plateau", "sol": "Sableux"},
            {"code": "CO", "nom": "CO", "superficie_ha": 2.07, "relief": "Plateau", "sol": "Argileux - Gravillonnaire"},
            {"code": "AA", "nom": "AA", "superficie_ha": 2.67, "relief": "Plateau", "sol": "Sableux - Argileux"},
        ]

        for s in secteurs_data:
            secteur, created = Secteur.objects.get_or_create(
                code=s["code"],
                defaults={
                    "nom": s["nom"],
                    "superficie_ha": s["superficie_ha"],
                    "situation_relief": s.get("relief", ""),
                    "type_sol": s.get("sol", ""),
                },
            )
            # Si le secteur existe deja sans infos, on complete
            if not created and (secteur.superficie_ha is None or secteur.superficie_ha == 0):
                secteur.superficie_ha = s["superficie_ha"]
                secteur.save(update_fields=["superficie_ha"])
            if not created and not (secteur.situation_relief or "").strip() and s.get("relief"):
                secteur.situation_relief = s["relief"]
                secteur.save(update_fields=["situation_relief"])
            if not created and not (secteur.type_sol or "").strip() and s.get("sol"):
                secteur.type_sol = s["sol"]
                secteur.save(update_fields=["type_sol"])

        secteurs = list(Secteur.objects.all())
        self.stdout.write(self.style.SUCCESS("Secteurs: OK"))

        # 2) Recolteurs (on garantit un minimum)
        recolteurs_base = [
            {"nom": "A. Konan", "code": "REC-001", "lieu_residence": "Grand-Palmeraie"},
            {"nom": "J. Nguessan", "code": "REC-002", "lieu_residence": "Boubou"},
            {"nom": "B. Ouattara", "code": "REC-003", "lieu_residence": "Plateau"},
            {"nom": "K. Kouadio", "code": "REC-004", "lieu_residence": "PM"},
            {"nom": "S. Traore", "code": "REC-005", "lieu_residence": "JC"},
            {"nom": "P. Yao", "code": "REC-006", "lieu_residence": "AA"},
        ]

        for r in recolteurs_base:
            Recolteur.objects.get_or_create(
                code=r["code"],
                defaults={
                    "nom": r["nom"],
                    "lieu_residence": r.get("lieu_residence", "N/A"),
                },
            )

        # Si besoin, on complete jusqu'a un minimum de recolteurs
        target_recolteurs = 12
        recolteurs = list(Recolteur.objects.all())
        if len(recolteurs) < target_recolteurs:
            missing = target_recolteurs - len(recolteurs)
            for i in range(missing):
                index = len(recolteurs) + i + 1
                Recolteur.objects.create(
                    code=f"REC-{index:03d}",
                    nom=f"Recolteur {index}",
                    lieu_residence=random.choice(["GP", "PM", "JC", "CO", "AA"]),
                )

        recolteurs = list(Recolteur.objects.all())
        self.stdout.write(self.style.SUCCESS("Recolteurs: OK"))

        # 3) Fiches de recolte (100 fiches)
        target_fiches = 100
        existing_fiches = FicheRecolte.objects.count()
        if existing_fiches < target_fiches:
            today = timezone.now().date()
            superviseurs = ["S. Traore", "K. Kouassi", "A. Bamba", "I. Kouadio"]
            adjoints = ["P. Yao", "M. N'Guessan", "L. Koffi", "D. Konan"]

            # Helper: cree une ligne + details
            def create_line(fiche, rec, regime_type, details):
                line = FicheRecolteLigne.objects.create(
                    fiche=fiche,
                    recolteur=rec,
                    recolteur_nom=rec.nom,
                    regime_type=regime_type,
                )

                for det in details:
                    FicheRecolteDetail.objects.create(
                        ligne=line,
                        secteur=det["secteur"],
                        secteur_code=det["secteur"].code,
                        quantite=det["quantite"],
                    )

                return line

            for i in range(target_fiches - existing_fiches):
                # Date et en-tete de fiche
                fiche = FicheRecolte.objects.create(
                    date=today - timedelta(days=existing_fiches + i),
                    superviseur_general=random.choice(superviseurs),
                    bareme_grands=60,
                    bareme_moyens=50,
                    bareme_petits=25,
                    depense_nourriture=random.randint(8000, 25000),
                    depense_transport=random.randint(4000, 12000),
                    observations="RAS",
                )

                # Superviseurs adjoints (1 a 2)
                for _ in range(random.randint(1, 2)):
                    SuperviseurAdjoint.objects.create(
                        fiche=fiche,
                        nom=random.choice(adjoints),
                        secteur_ou_recolteur=random.choice(secteurs).code,
                    )

                # Lignes recolteurs (3 a 5 recolteurs par fiche)
                reco_sample = random.sample(recolteurs, k=min(len(recolteurs), random.randint(3, 5)))
                for rec in reco_sample:
                    for regime_type in ["grands", "moyens", "petits"]:
                        # 3 secteurs par ligne pour garder un volume raisonnable
                        secteur_sample = random.sample(secteurs, k=min(len(secteurs), 3))
                        details = [
                            {"secteur": s, "quantite": random.randint(5, 40)}
                            for s in secteur_sample
                        ]
                        create_line(fiche, rec, regime_type, details)

                # Recu de vente (1 par fiche)
                FicheRecuVente.objects.create(
                    fiche=fiche,
                    date=fiche.date,
                    client=random.choice(["SAPH", "PALMCI", "OILPALM"]),
                    pesee_kg=random.randint(1800, 3200),
                    non_conformes_pct=random.randint(0, 5),
                    montant=random.randint(800000, 1800000),
                )

            self.stdout.write(self.style.SUCCESS("Fiches recolte: OK"))

        self.stdout.write(self.style.SUCCESS("Seed termine."))
