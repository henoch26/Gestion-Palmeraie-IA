"""
Génération des données 2024 — palmeraie.
2 fiches/mois, variation saisonnière Côte d'Ivoire, distribution par zone.
Exécuter: python manage.py shell -c "exec(open('seed_2024.py').read())"
"""
import random
import datetime
from django.db import transaction
from django.db.models import Sum
from recoltes.models import FicheRecolte, FicheRecolteLigne, FicheRecolteDetail
from secteurs.models import Secteur
from recolteurs.models import Personnel

random.seed(2024)

# ── Données de référence ─────────────────────────────────────────────
secteurs    = list(Secteur.objects.filter(statut="actif").order_by("id"))
recolteurs  = list(Personnel.objects.all())
sec_by_id   = {s.id: s for s in secteurs}
total_sup   = sum(float(s.superficie_ha) for s in secteurs)
sec_frac    = {s.id: float(s.superficie_ha) / total_sup for s in secteurs}

# ── Vérification ─────────────────────────────────────────────────────
existing = FicheRecolte.objects.filter(date__year=2024).count()
if existing:
    print(f"{existing} fiche(s) 2024 déjà présente(s) — suppression...")
    FicheRecolte.objects.filter(date__year=2024).delete()

# ── Zones de travail par récolteur ───────────────────────────────────
# Clé = id Personnel, Valeur = liste d'ids Secteur préférés
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

# ── Cible par fiche (régimes totaux) selon saison ────────────────────
# 2 fiches/mois, variation saisonnière (sec/pluie CI)
FICHE_TARGETS = {
    # mois : (fiche_1, fiche_2)
    1:  (370, 350),   # Saison sèche
    2:  (365, 355),
    3:  (430, 445),   # Transition
    4:  (520, 540),   # Grande saison des pluies
    5:  (580, 565),
    6:  (555, 540),
    7:  (430, 415),   # Petite saison sèche
    8:  (400, 390),
    9:  (500, 510),   # Petite saison des pluies
    10: (545, 555),
    11: (530, 520),
    12: (450, 430),   # Saison sèche
}

def distribute_ligne(fiche, recs, regime_type, regime_total):
    """Crée les lignes + détails pour un groupe de récolteurs et un type."""
    if not recs or regime_total <= 0:
        return
    per_rec_base = regime_total // len(recs)
    extras = regime_total - per_rec_base * len(recs)

    for i, rec in enumerate(recs):
        qty_rec = per_rec_base + (1 if i < extras else 0)
        if qty_rec <= 0:
            continue

        assigned_ids = ZONES.get(rec.id, [s.id for s in secteurs[:3]])
        assigned = [sec_by_id[sid] for sid in assigned_ids if sid in sec_by_id]
        if not assigned:
            assigned = secteurs[:3]

        # Légère variation aléatoire sur la quantité du récolteur (±10 %)
        qty_rec = max(1, qty_rec + random.randint(-qty_rec // 10, qty_rec // 10))

        ligne = FicheRecolteLigne.objects.create(
            fiche=fiche,
            recolteur=rec,
            recolteur_nom=rec.nom,
            regime_type=regime_type,
        )

        # Répartition proportionnelle à la superficie des secteurs assignés
        sup_total = sum(float(s.superficie_ha) for s in assigned)
        placed = 0
        for j, s in enumerate(assigned):
            if j == len(assigned) - 1:
                q = qty_rec - placed
            else:
                q = round(qty_rec * float(s.superficie_ha) / sup_total)
                placed += q
            if q > 0:
                FicheRecolteDetail.objects.create(
                    ligne=ligne,
                    secteur=s,
                    secteur_code=s.code,
                    quantite=q,
                )

# ── Génération ────────────────────────────────────────────────────────
print("Création des fiches 2024...")
annual_total = 0

with transaction.atomic():
    for month, (t1, t2) in FICHE_TARGETS.items():
        for day, target in [(8, t1), (22, t2)]:
            # Décalage de ±2 jours pour réalisme
            actual_day = min(max(1, day + random.randint(-2, 2)), 28)
            date = datetime.date(2024, month, actual_day)

            fiche = FicheRecolte.objects.create(
                date=date,
                statut="valide",
                superviseur_general="Adjoumani Firmin",
                bareme_grands=60,
                bareme_moyens=50,
                bareme_petits=25,
            )

            grands_t = int(target * 0.55)
            moyens_t = int(target * 0.30)
            petits_t = target - grands_t - moyens_t

            # Tirage de 10-12 récolteurs pour cette fiche
            n = random.randint(10, min(12, len(recolteurs)))
            fiche_recs = random.sample(recolteurs, n)

            g_recs = fiche_recs[:5]
            m_recs = fiche_recs[5:9]
            p_recs = fiche_recs[9:]

            distribute_ligne(fiche, g_recs, "grands",  grands_t)
            distribute_ligne(fiche, m_recs, "moyens",  moyens_t)
            distribute_ligne(fiche, p_recs, "petits",  petits_t)

            actual = FicheRecolteDetail.objects.filter(
                ligne__fiche=fiche
            ).aggregate(s=Sum("quantite"))["s"] or 0
            annual_total += actual
            print(f"  {date}  cible={target}  réel={actual} rég.")

print(f"\nTotal 2024 : {annual_total} régimes sur 24 fiches.")
print("Terminé.")
