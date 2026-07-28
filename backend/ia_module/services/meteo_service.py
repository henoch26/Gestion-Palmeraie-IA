"""
services/meteo_service.py — Récupération des données météorologiques via Open-Meteo API.

Open-Meteo est une API météo gratuite, sans clé API, fournissant des données
historiques et de prévision.
API doc : https://open-meteo.com/en/docs
"""
import logging
import json
from datetime import date, timedelta

import urllib.request
import urllib.parse

logger = logging.getLogger(__name__)

# Coordonnées par défaut : Dabou, village de Kpass (Côte d'Ivoire — région palmiers à huile)
DEFAULT_LAT = 5.322935334017861
DEFAULT_LON = -4.376969229174008

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_HISTORY = "https://archive-api.open-meteo.com/v1/archive"


class MeteoService:
    """Récupère et stocke les données météo depuis Open-Meteo."""

    def fetch_and_store(self, target_date=None, secteur=None):
        """
        Récupère les données météo pour une date donnée et les stocke en base.
        Si secteur est fourni, utilise ses coordonnées GPS si disponibles.
        """
        from ia_module.models import DonneeMeteo

        if target_date is None:
            target_date = date.today() - timedelta(days=1)

        lat, lon = self._get_coords(secteur)

        try:
            data = self._fetch_historical(target_date, lat, lon)
        except Exception as exc:
            logger.warning("Erreur API météo pour %s : %s. Données simulées utilisées.", target_date, exc)
            data = self._simulate_data(target_date)

        obj, created = DonneeMeteo.objects.update_or_create(
            date=target_date,
            secteur=secteur,
            defaults={
                "temperature_max":  data.get("temperature_max"),
                "temperature_min":  data.get("temperature_min"),
                "temperature_moy":  data.get("temperature_moy"),
                "precipitation_mm": data.get("precipitation_mm"),
                "humidite_pct":     data.get("humidite_pct"),
                "vitesse_vent_kmh": data.get("vitesse_vent_kmh"),
                "description":      data.get("description", ""),
                "source":           "open-meteo",
            },
        )
        action = "créée" if created else "mise à jour"
        logger.info("DonneeMeteo %s pour %s (secteur=%s)", action, target_date, secteur)
        return obj

    def fetch_and_store_range(self, date_debut, date_fin, secteur=None):
        """
        Récupère et stocke la météo pour toute une plage en UN seul appel API.
        Nettement plus rapide que fetch_and_store jour par jour.
        """
        from ia_module.models import DonneeMeteo

        lat, lon = self._get_coords(secteur)
        try:
            jours = self._fetch_historical_batch(date_debut, date_fin, lat, lon)
        except Exception as exc:
            logger.warning("Erreur API batch %s→%s : %s. Simulation journalière.", date_debut, date_fin, exc)
            jours = []
            current = date_debut
            while current <= date_fin:
                jours.append((current, self._simulate_data(current)))
                current += timedelta(days=1)

        results = []
        for target_date, data in jours:
            try:
                obj, created = DonneeMeteo.objects.update_or_create(
                    date=target_date,
                    secteur=secteur,
                    defaults={
                        "temperature_max":  data.get("temperature_max"),
                        "temperature_min":  data.get("temperature_min"),
                        "temperature_moy":  data.get("temperature_moy"),
                        "precipitation_mm": data.get("precipitation_mm"),
                        "humidite_pct":     data.get("humidite_pct"),
                        "vitesse_vent_kmh": data.get("vitesse_vent_kmh"),
                        "description":      data.get("description", ""),
                        "source":           "open-meteo",
                    },
                )
                results.append(obj)
            except Exception as exc:
                logger.error("Erreur sauvegarde %s : %s", target_date, exc)
        return results

    def fetch_all_secteurs_today(self):
        """Récupère la météo d'hier pour tous les secteurs actifs + une entrée globale."""
        from secteurs.models import Secteur

        yesterday = date.today() - timedelta(days=1)
        results = []

        # Entrée globale (sans secteur)
        results.append(self.fetch_and_store(yesterday, secteur=None))

        for secteur in Secteur.objects.filter(statut="actif"):
            try:
                results.append(self.fetch_and_store(yesterday, secteur=secteur))
            except Exception as exc:
                logger.error("Erreur météo secteur %s : %s", secteur.code, exc)

        return results

    # ── Méthodes privées ──────────────────────────────────────────────

    def _fetch_historical_batch(self, date_debut, date_fin, lat, lon):
        """
        Un seul appel API Open-Meteo pour toute la plage date_debut→date_fin.
        Retourne une liste de (date, data_dict).
        """
        from datetime import datetime

        yesterday = date.today() - timedelta(days=1)
        end = min(date_fin, yesterday)
        if date_debut > end:
            return []

        params = {
            "latitude":   lat,
            "longitude":  lon,
            "start_date": date_debut.strftime("%Y-%m-%d"),
            "end_date":   end.strftime("%Y-%m-%d"),
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
            "hourly": "relativehumidity_2m",
            "timezone": "Africa/Abidjan",
        }
        url = f"{OPEN_METEO_HISTORY}?{urllib.parse.urlencode(params, doseq=True)}"

        with urllib.request.urlopen(url, timeout=30) as resp:
            payload = json.loads(resp.read().decode())

        daily  = payload.get("daily", {})
        hourly = payload.get("hourly", {})

        dates_str  = daily.get("time", [])
        temp_maxes = daily.get("temperature_2m_max", [])
        temp_mines = daily.get("temperature_2m_min", [])
        precips    = daily.get("precipitation_sum", [])
        winds      = daily.get("windspeed_10m_max", [])
        humidites_h = hourly.get("relativehumidity_2m", [])

        def daily_humid(idx):
            chunk = humidites_h[idx * 24:(idx + 1) * 24]
            vals = [h for h in chunk if h is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        results = []
        for i, date_str in enumerate(dates_str):
            tmax = temp_maxes[i] if i < len(temp_maxes) else None
            tmin = temp_mines[i] if i < len(temp_mines) else None
            tmoy = round((tmax + tmin) / 2, 1) if tmax is not None and tmin is not None else None
            results.append((
                datetime.strptime(date_str, "%Y-%m-%d").date(),
                {
                    "temperature_max":  tmax,
                    "temperature_min":  tmin,
                    "temperature_moy":  tmoy,
                    "precipitation_mm": precips[i] if i < len(precips) else None,
                    "humidite_pct":     daily_humid(i),
                    "vitesse_vent_kmh": winds[i] if i < len(winds) else None,
                    "description":      f"Open-Meteo {date_str}",
                }
            ))
        return results

    def _get_coords(self, secteur):
        """Extrait latitude/longitude depuis les coordonnées GPS du secteur."""
        if secteur and secteur.coordonnees_GPS:
            try:
                parts = secteur.coordonnees_GPS.replace(" ", "").split(",")
                return float(parts[0]), float(parts[1])
            except (ValueError, IndexError):
                pass
        return DEFAULT_LAT, DEFAULT_LON

    def _fetch_historical(self, target_date, lat, lon):
        """Appelle l'API Open-Meteo Historical pour une date précise."""
        date_str = target_date.strftime("%Y-%m-%d")
        params = {
            "latitude":   lat,
            "longitude":  lon,
            "start_date": date_str,
            "end_date":   date_str,
            "daily":      "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
            "hourly":     "relativehumidity_2m",
            "timezone":   "Africa/Abidjan",
        }
        url = f"{OPEN_METEO_HISTORY}?{urllib.parse.urlencode(params, doseq=True)}"

        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode())

        daily = payload.get("daily", {})
        hourly = payload.get("hourly", {})

        temp_max = (daily.get("temperature_2m_max") or [None])[0]
        temp_min = (daily.get("temperature_2m_min") or [None])[0]
        precip   = (daily.get("precipitation_sum")  or [None])[0]
        wind     = (daily.get("windspeed_10m_max")  or [None])[0]

        humidites = [h for h in (hourly.get("relativehumidity_2m") or []) if h is not None]
        humid = sum(humidites) / len(humidites) if humidites else None

        temp_moy = None
        if temp_max is not None and temp_min is not None:
            temp_moy = round((temp_max + temp_min) / 2, 1)

        return {
            "temperature_max":  temp_max,
            "temperature_min":  temp_min,
            "temperature_moy":  temp_moy,
            "precipitation_mm": precip,
            "humidite_pct":     round(humid, 1) if humid else None,
            "vitesse_vent_kmh": wind,
            "description":      f"Open-Meteo {date_str}",
        }

    def _simulate_data(self, target_date):
        """Données simulées basées sur les moyennes saisonnières CI."""
        import random
        month = target_date.month
        MONTHLY = {
            1: (33, 23, 30, 78, 15), 2: (34, 24, 25, 76, 14),
            3: (34, 24, 80, 80, 13), 4: (33, 24, 120, 82, 12),
            5: (32, 24, 150, 84, 11), 6: (30, 23, 180, 85, 10),
            7: (29, 23, 160, 83, 12), 8: (29, 23, 140, 82, 13),
            9: (30, 23, 130, 81, 12), 10: (31, 24, 90, 80, 11),
            11: (32, 24, 60, 79, 12), 12: (33, 23, 40, 78, 13),
        }
        tmax, tmin, precip, humid, wind = MONTHLY[month]
        return {
            "temperature_max":  tmax + random.uniform(-1, 1),
            "temperature_min":  tmin + random.uniform(-1, 1),
            "temperature_moy":  (tmax + tmin) / 2,
            "precipitation_mm": max(0, precip + random.uniform(-10, 10)),
            "humidite_pct":     min(100, max(50, humid + random.uniform(-3, 3))),
            "vitesse_vent_kmh": wind + random.uniform(-2, 2),
            "description":      f"Données simulées {target_date}",
        }
