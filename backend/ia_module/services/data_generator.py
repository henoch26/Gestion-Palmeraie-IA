"""
services/data_generator.py - Generation de donnees synthetiques pour l'entrainement ML.

Utilise quand les donnees reelles sont insuffisantes. Les observations restent
simples : periode, secteur, meteo courante et quantite recoltee.
"""
import random


class DataGenerator:
    """Genere des donnees synthetiques simples pour la palmeraie."""

    SAISON_COEFF = {
        1: 0.70,  2: 0.65,  3: 0.80,  4: 0.90,
        5: 1.10,  6: 1.20,  7: 1.15,  8: 1.05,
        9: 1.00, 10: 0.95, 11: 0.85, 12: 0.75,
    }
    METEO_MOIS = {
        1:  (27, 30, 78),   2:  (28, 25, 76),   3:  (29, 80, 80),
        4:  (29, 120, 82),  5:  (28, 150, 84),  6:  (27, 180, 85),
        7:  (26, 160, 83),  8:  (26, 140, 82),  9:  (27, 130, 81),
        10: (28, 90, 80),   11: (28, 60, 79),   12: (27, 40, 78),
    }

    def generate_rendement_rows(self, n=200, seed=42):
        """Genere n observations synthetiques pour la prediction de rendement."""
        random.seed(seed)
        rows = []
        secteurs = self._fake_secteurs(5)

        for _ in range(n):
            annee = random.randint(2020, 2025)
            mois = random.randint(1, 12)
            sec = random.choice(secteurs)
            coeff = self.SAISON_COEFF[mois]
            temp, precip, humid = self.METEO_MOIS[mois]

            temp += random.gauss(0, 1.5)
            precip += random.gauss(0, 15)
            humid += random.gauss(0, 3)

            age_factor = min(1.0, max(0.3, (sec["age_moyen_plants"] - 3) / 15))
            base_qty = sec["nb_palmiers"] * coeff * age_factor * random.uniform(0.7, 1.3)
            meteo_bonus = max(0, (precip - 50) / 200) * sec["nb_palmiers"] * 0.05
            quantite = max(0, base_qty + meteo_bonus + random.gauss(0, base_qty * 0.1))

            recentes = self._meteo_recente(mois)
            age_reel_mois = sec["age_moyen_plants"] * 12
            rows.append({
                "annee": annee,
                "mois": mois,
                "secteur_id": sec["id"],
                "superficie_ha": sec["superficie_ha"],
                "age_moyen_plants": sec["age_moyen_plants"],
                "nb_palmiers": sec["nb_palmiers"],
                "rendement_cible": sec["rendement_cible"],
                "temperature_moy": round(temp, 1),
                "precipitation_mm": round(max(0, precip), 1),
                "humidite_pct": round(min(100, max(0, humid)), 1),
                "age_reel_plantation_mois": age_reel_mois,
                "age_reel_plants_mois": age_reel_mois,
                "pluie_cumulee_3_mois": recentes["pluie_3"],
                "pluie_cumulee_6_mois": recentes["pluie_6"],
                "humidite_moyenne_3_mois": recentes["humidite_3"],
                "temperature_moyenne_3_mois": recentes["temperature_3"],
                "quantite_totale": round(quantite, 1),
            })

        return rows

    def generate_anomalie_rows(self, n=200, anomalie_rate=0.15, seed=42):
        """Genere un dataset labelise pour la detection supervisee d'anomalies."""
        rows = self.generate_rendement_rows(n=n, seed=seed)
        for row in rows:
            is_anomaly = random.random() < anomalie_rate
            if is_anomaly:
                direction = random.choice(["high", "low"])
                if direction == "high":
                    row["quantite_totale"] = round(row["quantite_totale"] * random.uniform(1.4, 2.5), 1)
                else:
                    row["quantite_totale"] = round(row["quantite_totale"] * random.uniform(0.1, 0.45), 1)
            row["is_anomaly"] = 1 if is_anomaly else 0
        return rows

    def _meteo_recente(self, mois):
        def prev_month(offset):
            return ((mois - offset - 1) % 12) + 1

        mois_3 = [prev_month(offset) for offset in range(3, 0, -1)]
        mois_6 = [prev_month(offset) for offset in range(6, 0, -1)]
        meteo_3 = [self.METEO_MOIS[m] for m in mois_3]
        meteo_6 = [self.METEO_MOIS[m] for m in mois_6]
        return {
            "pluie_3": round(sum(m[1] for m in meteo_3), 1),
            "pluie_6": round(sum(m[1] for m in meteo_6), 1),
            "humidite_3": round(sum(m[2] for m in meteo_3) / len(meteo_3), 1),
            "temperature_3": round(sum(m[0] for m in meteo_3) / len(meteo_3), 1),
        }

    def _fake_secteurs(self, count):
        secteurs = []
        for i in range(1, count + 1):
            secteurs.append({
                "id": i,
                "superficie_ha": random.uniform(5, 50),
                "age_moyen_plants": random.randint(5, 20),
                "nb_palmiers": random.randint(50, 500),
                "rendement_cible": random.uniform(10, 20),
            })
        return secteurs
