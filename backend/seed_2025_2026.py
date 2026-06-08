"""
Reseed 2025 et 2026 — 1 à 2 fiches/mois, variation saisonnière CI.
Supprime toutes les fiches hors 2024, puis recrée 2025 et 2026.
Exécuter : python manage.py shell -c "exec(open('seed_2025_2026.py').read())"
"""
import random
import datetime
from django.db import transaction
from django.db.models import Sum
from recoltes.models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail
from secteurs.models import Secteur
from recolteurs.models import Personnel

random.seed(2025)

# ── Suppression données hors 2024 ─────────────────────────────────────
to_del = FicheRecolte.objects.exclude(date__year=2024)
print(f"Suppression de {to_del.count()} fiche(s) (hors 2024)...")
to_del.delete()

# ── Données de référence ──────────────────────────────────────────────
secteurs   = list(Secteur.objects.filter(statut="actif").order_by("id"))
recolteurs = list(Personnel.objects.all())
sec_by_id  = {s.id: s for s in secteurs}

ZONES = {
    1:  [1, 2, 6],   # A. Konan       → GP_1, GP_2, JC_1
    2:  [1, 2, 3],   # J. Nguessan    → GP_1, GP_2, RTE_BOUB
    3:  [6, 7, 4],   # B. Ouattara    → JC_1, JC_2, PM_1
    4:  [6, 7, 5],   # K. Kouadio     → JC_1, JC_2, PM_2
    5:  [4, 5, 8],   # S. Traore      → PM_1, PM_2, CO
    6:  [4, 5, 9],   # P. Yao         → PM_1, PM_2, AA
    7:  [8, 3, 12],  # Recolteur 7    → CO, RTE_BOUB, SECTEUR_S
    8:  [9, 12, 1],  # Recolteur 8    → AA, SECTEUR_S, GP_1
    10: [1, 6, 8],   # Recolteur 10   → GP_1, JC_1, CO
    11: [2, 5, 12],  # Recolteur 11   → GP_2, PM_2, SECTEUR_S
    12: [4, 3, 9],   # Recolteur 12   → PM_1, RTE_BOUB, AA
    13: [6, 1, 5],   # Kouassi Bertin → JC_1, GP_1, PM_2
    16: [2, 7, 4],   # Kouame Celestin→ GP_2, JC_2, PM_1
    17: [9, 8, 3],   # Martial Kouao  → AA, CO, RTE_BOUB
}

def create_fiche(date, target):
    fiche = FicheRecolte.objects.create(
        date=date, statut="valide",
        superviseur_general="Adjoumani Firmin",
        bareme_grands=60, bareme_moyens=50, bareme_petits=25,
    )
    grands_t = int(target * 0.55)
    moyens_t = int(target * 0.30)
    petits_t = target - grands_t - moyens_t

    n = random.randint(10, min(12, len(recolteurs)))
    recs = random.sample(recolteurs, n)

    for regime_type, rtotal, group in [
        ("grands", grands_t, recs[:5]),
        ("moyens", moyens_t, recs[5:9]),
        ("petits", petits_t, recs[9:]),
    ]:
        if not group or rtotal <= 0:
            continue
        per   = rtotal // len(group)
        extra = rtotal - per * len(group)
        for i, rec in enumerate(group):
            qty = per + (1 if i < extra else 0)
            if qty <= 0:
                continue
            qty = max(1, qty + random.randint(-max(1, qty // 10), max(1, qty // 10)))
            assigned_ids = ZONES.get(rec.id, [s.id for s in secteurs[:3]])
            assigned = [sec_by_id[sid] for sid in assigned_ids if sid in sec_by_id] or secteurs[:3]
            ligne = FicheRecolteLigne.objects.create(
                fiche=fiche, recolteur=rec, recolteur_nom=rec.nom, regime_type=regime_type
            )
            sup_total = sum(float(s.superficie_ha) for s in assigned)
            placed = 0
            for j, s in enumerate(assigned):
                if j == len(assigned) - 1:
                    q = qty - placed
                else:
                    q = round(qty * float(s.superficie_ha) / sup_total)
                    placed += q
                if q > 0:
                    FicheRecolteDetail.objects.create(
                        ligne=ligne, secteur=s, secteur_code=s.code, quantite=q
                    )

    actual = FicheRecolteDetail.objects.filter(
        ligne__fiche=fiche
    ).aggregate(s=Sum("quantite"))["s"] or 0
    print(f"  {date}  cible={target:4d}  réel={actual:4d}")
    return actual

def jd(base): return base + random.randint(-2, 2)  # jitter ±2 jours

# ── Plan 2025 — +18 % vs 2024, 2 fiches/mois ─────────────────────────
PLAN_2025 = {
    1:  [(jd(8), 425), (jd(22), 410)],
    2:  [(jd(8), 410), (jd(22), 400)],
    3:  [(jd(8), 510), (jd(22), 500)],
    4:  [(jd(8), 600), (jd(22), 595)],
    5:  [(jd(8), 650), (jd(22), 645)],
    6:  [(jd(8), 648), (jd(22), 640)],
    7:  [(jd(8), 492), (jd(22), 488)],
    8:  [(jd(8), 462), (jd(22), 458)],
    9:  [(jd(8), 600), (jd(22), 595)],
    10: [(jd(8), 640), (jd(22), 635)],
    11: [(jd(8), 605), (jd(22), 600)],
    12: [(jd(8), 510), (jd(22), 505)],
}

# ── Plan 2026 — +15 % vs 2025, Jan–Mai 2 fiches, Juin 1 fiche ─────────
PLAN_2026 = {
    1: [(jd(8), 490), (jd(22), 472)],
    2: [(jd(8), 472), (jd(22), 455)],
    3: [(jd(8), 587), (jd(22), 570)],
    4: [(jd(8), 690), (jd(22), 680)],
    5: [(jd(8), 748), (jd(22), 740)],
    6: [(5,    720)],               # 1 seule récolte au 5 juin (avant le 7 juin)
}

print("\n=== Création 2025 ===")
total_2025 = 0
with transaction.atomic():
    for month, entries in PLAN_2025.items():
        for day, target in entries:
            total_2025 += create_fiche(datetime.date(2025, month, day), target)
nb_2025 = sum(len(v) for v in PLAN_2025.values())
print(f"Total 2025 : {total_2025} régimes sur {nb_2025} fiches.\n")

print("=== Création 2026 ===")
total_2026 = 0
with transaction.atomic():
    for month, entries in PLAN_2026.items():
        for day, target in entries:
            total_2026 += create_fiche(datetime.date(2026, month, day), target)
nb_2026 = sum(len(v) for v in PLAN_2026.values())
print(f"Total 2026 (Jan–Juin) : {total_2026} régimes sur {nb_2026} fiches.\n")

print("=== Résumé ===")
for year in [2024, 2025, 2026]:
    from recoltes.models import FicheRecolteDetail
    n = FicheRecolte.objects.filter(date__year=year).count()
    t = FicheRecolteDetail.objects.filter(
        ligne__fiche__date__year=year
    ).aggregate(s=Sum("quantite"))["s"] or 0
    print(f"  {year} : {n} fiches, {t} régimes")

print("\nTerminé.")
