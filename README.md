# Projet Gestion Palmeraie

Application web de gestion d'une palmeraie : **secteurs**, **récoltes**, **récolteurs**, **travaux** et **matériels**, avec un **dashboard** de synthèse.

- **Backend** : Django + Django REST Framework (TokenAuth) + PostgreSQL
- **Frontend** : React + Vite

## Structure du dépôt

- `backend/` : API Django (DRF) + apps (dashboard, secteurs, recoltes, recolteurs, travaux, materiels)
- `frontend/` : interface React

## Prérequis

- Python **3.11+** et `pip`
- PostgreSQL (par défaut **port 5433** dans `backend/config/settings.py`)
- Node.js (**20.19+** recommandé) + `npm` (Vite 7 requiert Node >= 20.19)

## Démarrage (dev)

### 1) Base de données (PostgreSQL)

Se connecter à PostgreSQL (adapter le port si besoin) :

```sql
-- psql -U postgres -p 5433

-- 1) Utilisateur dédié
CREATE USER palmeraie_user WITH PASSWORD 'Palmeraie26@04#';
ALTER USER palmeraie_user NOCREATEDB;
ALTER USER palmeraie_user NOSUPERUSER;
ALTER USER palmeraie_user NOCREATEROLE;

-- 2) Base de données
CREATE DATABASE gestion_palmeraie OWNER palmeraie_user ENCODING 'UTF8';

-- 3) Privilèges
\c gestion_palmeraie
GRANT USAGE, CREATE ON SCHEMA public TO palmeraie_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO palmeraie_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO palmeraie_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO palmeraie_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO palmeraie_user;
```

Remarque : les identifiants sont actuellement configurés en dur dans `backend/config/settings.py` (DB, user, password, port). Si tu changes ces valeurs côté PostgreSQL, mets ce fichier à jour.

### 2) Backend (Django)

```bash
cd backend

# (recommandé) créer/activer un venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

URLs utiles :

- API : `http://127.0.0.1:8000/api/`
- Healthcheck : `GET http://127.0.0.1:8000/api/health/`
- Admin Django : `http://127.0.0.1:8000/admin/`

### 3) Frontend (React)

Installer les dépendances :

```bash
# dépendances frontend
cd frontend
npm install

# dépendance Chart.js (installée à la racine du dépôt)
cd ..
npm install
```

Optionnel : configurer l'URL de l'API dans `frontend/.env` (sinon défaut = `http://127.0.0.1:8000/api`) :

```env
VITE_API_URL=http://127.0.0.1:8000/api
```

Lancer le serveur Vite :

```bash
cd frontend
npm run dev
```

Ouvrir : `http://localhost:5173/`

## Authentification (Token DRF)

- Auth par token (`TokenAuthentication`) + permissions globales `IsAuthenticated`
- Endpoints publics :
  - `POST /api/auth/login/` (body JSON : `{ "username": "...", "password": "..." }`)
  - `GET /api/health/`
- Pour appeler les endpoints protégés : header `Authorization: Token <token>`

## Endpoints principaux

- `GET/POST /api/secteurs/` (+ exports : `/api/secteurs/export/`, `/api/secteurs/{id}/export/?year=YYYY`)
- `GET/POST /api/recolteurs/` (+ stats : `/api/recolteurs/stats/?year=YYYY`, exports : `/api/recolteurs/export/?year=YYYY`)
- `GET/POST /api/recoltes/` (+ analytics : `/api/recoltes/analytics/?year=YYYY`, export : `/api/recoltes/export/`)
- `GET/POST /api/travaux/` (+ export : `/api/travaux/export/`)
- `GET/POST /api/materiels/`
- `GET /api/dashboard/summary/?year=YYYY&secteur=<id>&recolteur=<id>&regime_type=grands|moyens|petits`

### Paiements

- `GET /api/paiements/?year=YYYY&month=MM&statut=en_attente|paye|annule` (liste)
- `PUT /api/paiements/{id}/` (body : `{ "statut": "paye|en_attente|annule" }`)
- `POST /api/paiements/sync/?year=YYYY` (recalcule les paiements à partir des fiches)
- `GET /api/paiements/summary/?year=YYYY&month=MM` (totaux par récolteur)
- `GET /api/paiements/export/?year=YYYY&month=MM` (CSV)

Règle : une **fiche de récolte n’est plus modifiable/supprimable** dès qu’au moins un paiement associé est en statut **`paye`**.

### IA (prédictions + anomalies)

- `GET /api/ia/summary/?year=YYYY&secteur=<id>` (prédictions + anomalies)
- `GET /api/ia/advanced/?year=YYYY&secteur=<id>&horizon=6` (pipeline IA avancé : régression rendement, Isolation Forest, clustering récolteurs, scores, interprétation et recommandations)
- `GET/POST /api/ia/facteurs-production/` (facteurs influençant le rendement : météo, sol, intrants, maladies, main-d'œuvre, accessibilité, incidents)
- `GET /api/ia/facteurs-production/template/` + `POST /api/ia/facteurs-production/import/`
- `POST /api/ia/anomalies/recompute/?year=YYYY` (enregistre les anomalies en base)
- `POST /api/ia/predictions/recompute/?year=YYYY&secteur=<id>&horizon=6` (enregistre un scénario)

### Import CSV (numérisation)

Pages UI :

- `http://localhost:5173/import`

Endpoints :

- `GET /api/secteurs/template/` + `POST /api/secteurs/import/`
- `GET /api/recolteurs/template/` + `POST /api/recolteurs/import/`
- `GET /api/recoltes/template/` + `POST /api/recoltes/import/`
- `GET /api/materiels/template/` + `POST /api/materiels/import/`
- `GET /api/travaux/template/` + `POST /api/travaux/import/`
"# Gestion-Palmeraie-IA" 
