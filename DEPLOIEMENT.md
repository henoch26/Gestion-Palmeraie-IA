# Guide de deploiement — Application Gestion Palmeraie

> **Lire entierement avant de commencer.** Ce guide couvre tout, de la configuration du serveur jusqu'au premier acces utilisateur.

---

## Architecture de production

```
Internet
    |
    v
+--------------------------------------------------+
|  Nginx  (ports 80 et 443)                        |
|                                                  |
|  /            --> Frontend React (dist/)         |
|  /api/        --> Proxy vers Gunicorn (Django)   |
|  /admin/      --> Proxy vers Gunicorn (Django)   |
|  /static/     --> Fichiers statiques Django      |
|  /media/      --> Fichiers medias uploades       |
+--------------------------------------------------+
         |
         v
+------------------+     +---------------------+
|  Gunicorn        |---->|  PostgreSQL          |
|  (Django WSGI)   |     |  (base de donnees)   |
+------------------+     +---------------------+
```

---

## Prerequis

| Element              | Valeur minimale                              |
|----------------------|----------------------------------------------|
| Serveur              | VPS Ubuntu 22.04 LTS (1 Go RAM, 1 vCPU)     |
| Nom de domaine       | Doit pointer vers l'IP du serveur            |
| Acces serveur        | SSH en tant que root ou utilisateur sudo     |
| Machine locale       | Git, Node.js 18+, Python 3.11+              |

**Avant de commencer, remplacer partout dans ce guide :**
- `TON_DOMAINE.com` → ton vrai nom de domaine (ex: palmeraie-ci.com)
- `TON_IP_SERVEUR` → l'adresse IP du serveur (ex: 192.168.1.10)
- `MOT_DE_PASSE_BD` → un mot de passe fort pour PostgreSQL
- `CLE_SECRETE_GENEREE` → la cle secrete Django (voir Phase 4.3)

---

## PHASE 0 — Sur ta machine locale

### 0.1 Verifier que le code est a jour

Les modifications necessaires ont deja ete faites dans le code :
- `backend/config/settings.py` lit maintenant les variables depuis `.env`
- `backend/requirements.txt` inclut `gunicorn` et `python-dotenv`

### 0.2 Creer le fichier .env local pour ne pas casser le developpement

Dans `backend/`, copier `.env.example` en `.env` et remplir les valeurs locales :

```ini
DEBUG=True
SECRET_KEY=django-insecure-nnee*91z^+p^o^&a6qrc+0%5_f!g!*b8r2jjz6eb!bfr867%!3
ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=gestion_palmeraie
DB_USER=palmeraie_user
DB_PASSWORD=Palmeraie26@04#
DB_HOST=localhost
DB_PORT=5433
```

> Ce fichier reste uniquement sur ta machine. Il est deja ignore par Git (.gitignore).

### 0.3 Installer python-dotenv localement

```bash
cd backend
pip install python-dotenv
```

### 0.4 Verifier que l'application fonctionne toujours

```bash
python manage.py runserver
```

Si le serveur demarre normalement, tu peux passer a la suite.

---

## PHASE 1 — Sur le serveur : Installation du systeme

### 1.1 Se connecter au serveur

```bash
ssh root@TON_IP_SERVEUR
```

### 1.2 Mettre a jour le systeme

```bash
apt update && apt upgrade -y
```

### 1.3 Installer toutes les dependances systeme

```bash
apt install -y python3.11 python3.11-venv python3-pip \
               postgresql postgresql-contrib \
               nginx certbot python3-certbot-nginx \
               git curl
```

### 1.4 Creer un utilisateur dedie (plus sur que root)

```bash
adduser palmeraie
usermod -aG www-data palmeraie
usermod -aG sudo palmeraie
```

> Choisir un mot de passe fort lors de la creation. Toutes les operations suivantes se feront avec cet utilisateur.

---

## PHASE 2 — Base de donnees PostgreSQL

### 2.1 Ouvrir la console PostgreSQL

```bash
sudo -u postgres psql
```

### 2.2 Creer l'utilisateur et la base de donnees

Executer ces commandes dans la console PostgreSQL.
Remplacer `MOT_DE_PASSE_BD` par un vrai mot de passe :

```sql
CREATE USER palmeraie_user WITH PASSWORD 'MOT_DE_PASSE_BD';
CREATE DATABASE gestion_palmeraie OWNER palmeraie_user;t
GRANT ALL PRIVILEGES ON DATABASE gestion_palmeraie TO palmeraie_user;
\q
```

### 2.3 Verifier la connexion

```bash
psql -U palmeraie_user -d gestion_palmeraie -h localhost
```

Si le prompt `gestion_palmeraie=>` apparait, taper `\q` pour quitter. La base fonctionne.

> **Note importante** : Sur Ubuntu, PostgreSQL utilise le port **5432** par defaut.
> C'est different du port **5433** utilise en developpement local.
> Le fichier `.env` de production devra avoir `DB_PORT=5432`.

---

## PHASE 3 — Deployer le code source

### 3.1 Passer sur l'utilisateur palmeraie

```bash
su - palmeraie
```

### 3.2 Cloner le depot Git

```bash
cd /home/palmeraie
git clone TON_URL_GIT app
```

> Remplacer `TON_URL_GIT` par l'URL du depot (ex: https://github.com/toncompte/palmeraie.git).
> Si le depot est prive, utiliser un token d'acces personnel.

### 3.3 Structure finale attendue

```
/home/palmeraie/app/
├── backend/
│   ├── config/
│   ├── accounts/
│   ├── recoltes/
│   ├── ... (autres apps Django)
│   ├── requirements.txt
│   └── .env             <-- a creer dans la Phase 4.3
└── frontend/
    ├── src/
    ├── public/
    └── package.json
```

---

## PHASE 4 — Configurer et lancer le backend Django

### 4.1 Creer l'environnement virtuel Python

```bash
cd /home/palmeraie/app/backend
python3.11 -m venv venv
source venv/bin/activate
```

### 4.2 Installer les dependances Python

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.3 Creer le fichier .env de PRODUCTION

```bash
nano /home/palmeraie/app/backend/.env
```

Coller le contenu suivant en remplacant TOUTES les valeurs :

```ini
# ============================
# PRODUCTION — NE PAS PARTAGER
# ============================

DEBUG=False
SECRET_KEY=CLE_SECRETE_GENEREE
ALLOWED_HOSTS=TON_DOMAINE.com,www.TON_DOMAINE.com
CORS_ALLOWED_ORIGINS=https://TON_DOMAINE.com,https://www.TON_DOMAINE.com
CSRF_TRUSTED_ORIGINS=https://TON_DOMAINE.com,https://www.TON_DOMAINE.com

DB_NAME=gestion_palmeraie
DB_USER=palmeraie_user
DB_PASSWORD=MOT_DE_PASSE_BD
DB_HOST=localhost
DB_PORT=5432

# --- Email (reinitialisation mot de passe) ---
EMAIL_HOST_USER=ton.adresse@gmail.com
EMAIL_HOST_PASSWORD=MOT_DE_PASSE_APP_GMAIL
FRONTEND_URL=https://TON_DOMAINE.com
```

> **Generer la cle secrete** avec cette commande avant de remplir le fichier :
> ```bash
> python -c "import secrets; print(secrets.token_urlsafe(50))"
> ```
> Copier la valeur affichee et la coller apres `SECRET_KEY=`.

Sauvegarder avec `CTRL+O`, puis `CTRL+X` pour quitter nano.

Proteger le fichier (lisible uniquement par l'utilisateur palmeraie) :
```bash
chmod 600 /home/palmeraie/app/backend/.env
```

---

### 4.3.1 — Configurer l'envoi d'emails Gmail (fonction "Mot de passe oublié")

L'application utilise Gmail pour envoyer les liens de réinitialisation de mot de passe.
Pour que cela fonctionne sur le serveur, il faut un **Mot de passe d'application Gmail** (pas ton vrai mot de passe Gmail).

#### Etape 1 — Activer la validation en deux etapes sur ton compte Gmail

1. Aller sur [myaccount.google.com](https://myaccount.google.com)
2. Cliquer sur **Securite** (dans le menu de gauche)
3. Dans la section **"Comment vous vous connectez a Google"**, cliquer sur **Validation en deux etapes**
4. Suivre les instructions pour l'activer si ce n'est pas deja fait

> Sans la validation en deux etapes, les mots de passe d'application ne sont pas disponibles.

#### Etape 2 — Creer un mot de passe d'application

1. Toujours dans **Securite**, chercher la section **"Comment vous vous connectez a Google"**
2. Cliquer sur **Mots de passe des applications** (si ce n'est pas visible, cherche-le via la barre de recherche du compte Google)
3. Dans le champ **"Nom de l'application"**, entrer : `Palmeraie`
4. Cliquer sur **Creer**
5. Google affiche un mot de passe de **16 caracteres** (exemple : `abcd efgh ijkl mnop`)
   — **Copier ce mot de passe maintenant**, il ne sera plus visible ensuite
6. Cliquer sur **OK**

#### Etape 3 — Renseigner les variables dans le .env du serveur

```bash
nano /home/palmeraie/app/backend/.env
```

Remplacer les deux lignes email par les vraies valeurs :

```ini
EMAIL_HOST_USER=ton.adresse@gmail.com
EMAIL_HOST_PASSWORD=abcdefghijklmnop
FRONTEND_URL=https://TON_DOMAINE.com
```

> - `EMAIL_HOST_USER` : l'adresse Gmail utilisee pour envoyer les emails
> - `EMAIL_HOST_PASSWORD` : le mot de passe d'application a 16 caracteres (sans espaces)
> - `FRONTEND_URL` : l'URL publique de ton application (le lien de reinitialisation contiendra cette URL)

Sauvegarder avec `CTRL+O` puis `CTRL+X`.

#### Etape 4 — Redemarrer Gunicorn pour prendre en compte les changements

```bash
exit   # repasser en root si tu es sur l'utilisateur palmeraie
systemctl restart palmeraie
```

#### Etape 5 — Tester l'envoi d'email

Sur la page de connexion, cliquer sur **"Mot de passe oublié ?"**, entrer l'email de l'administrateur et verifier qu'un email arrive dans la boite mail (verifier aussi les spams).

Pour verifier les logs si l'email n'arrive pas :
```bash
tail -50 /home/palmeraie/app/backend/logs/error.log
```

Les erreurs Gmail les plus courantes :
- `SMTPAuthenticationError` : le mot de passe d'application est incorrect ou la validation en deux etapes n'est pas activee
- `Connection refused` : le port 587 est bloque par le pare-feu du serveur (voir ci-dessous)

#### Si le port 587 est bloque par le pare-feu du serveur

Certains hebergeurs bloquent le port SMTP sortant (587). Verifier avec :
```bash
telnet smtp.gmail.com 587
```
Si la connexion echoue, contacter l'hebergeur pour demander l'ouverture du port 587 sortant.

#### Alternative si Gmail ne peut pas etre utilise

Si l'hebergeur bloque les ports SMTP ou si tu ne veux pas utiliser Gmail, tu peux utiliser un service SMTP tiers :

| Service | SMTP_HOST | PORT | Notes |
|---------|-----------|------|-------|
| Gmail | smtp.gmail.com | 587 | Gratuit, 500 emails/jour |
| SendGrid | smtp.sendgrid.net | 587 | Plan gratuit : 100/jour |
| Mailgun | smtp.mailgun.org | 587 | Plan gratuit : 100/jour |
| OVH Mail | ssl0.ovh.net | 587 | Inclus dans certains hebergements OVH |

Pour utiliser un service autre que Gmail, modifier `backend/config/settings.py` :
```python
EMAIL_HOST = "smtp.sendgrid.net"      # remplacer par le bon SMTP
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_PORT = 587
EMAIL_USE_TLS = True
```

#### Mode console (si EMAIL_HOST_USER est vide)

Si `EMAIL_HOST_USER` n'est pas defini dans le `.env`, Django n'envoie pas d'email mais **affiche le contenu du mail dans les logs Gunicorn**. Utile pour deboguer sur un serveur de test :
```bash
journalctl -u palmeraie -f   # voir les emails simules en temps reel
```

---

### 4.4 Appliquer les migrations

```bash
cd /home/palmeraie/app/backend
source venv/bin/activate
python manage.py migrate
```

### 4.5 Collecter les fichiers statiques

```bash
python manage.py collectstatic --noinput
```

> Cela cree le dossier `staticfiles/` avec les CSS/JS du panel admin Django.
> **Sans cette commande, l'interface d'administration sera sans style.**

### 4.6 Creer le compte administrateur de l'application

```bash
python manage.py createsuperuser
```

Suivre les instructions : entrer un nom d'utilisateur, email, mot de passe.

> Ce compte permet d'acceder a `https://TON_DOMAINE.com/admin/` (interface technique Django).
> Le compte administrateur de l'application Palmeraie se cree ensuite via la page Gestion des utilisateurs.

### 4.7 Verifier la configuration Django

```bash
python manage.py check --deploy
```

Resultat attendu : `System check identified no issues` ou des avertissements mineurs.
Si une ERREUR apparait (pas un WARNING), la corriger avant de continuer.

---

## PHASE 5 — Configurer Gunicorn (serveur WSGI)

Gunicorn est le serveur qui fait tourner Django en production.

### 5.1 Tester Gunicorn manuellement

```bash
cd /home/palmeraie/app/backend
source venv/bin/activate
gunicorn --bind 0.0.0.0:8000 config.wsgi:application
```

Tester depuis ton navigateur : `http://TON_IP_SERVEUR:8000/api/health/`
Si une reponse JSON apparait, Gunicorn fonctionne. Arreter avec `CTRL+C`.

### 5.2 Creer le service systemd (demarrage automatique)

Repasser en root :
```bash
exit
```

Creer le fichier de service :
```bash
nano /etc/systemd/system/palmeraie.service
```

Contenu a coller :
```ini
[Unit]
Description=Gunicorn daemon - Gestion Palmeraie
After=network.target

[Service]
User=palmeraie
Group=www-data
WorkingDirectory=/home/palmeraie/app/backend
ExecStart=/home/palmeraie/app/backend/venv/bin/gunicorn \
          --workers 3 \
          --bind unix:/home/palmeraie/app/backend/gunicorn.sock \
          --timeout 120 \
          --access-logfile /home/palmeraie/app/backend/logs/access.log \
          --error-logfile /home/palmeraie/app/backend/logs/error.log \
          config.wsgi:application
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Creer le dossier de logs et demarrer le service :
```bash
mkdir -p /home/palmeraie/app/backend/logs
chown palmeraie:www-data /home/palmeraie/app/backend/logs

systemctl daemon-reload
systemctl start palmeraie
systemctl enable palmeraie
systemctl status palmeraie
```

La ligne **Active: active (running)** confirme que Gunicorn tourne.
`enable` garantit qu'il redemarrera automatiquement si le serveur redemarre.

---

## PHASE 6 — Construire et deployer le frontend React

Cette phase se fait sur **ta machine locale**.

### 6.1 Creer le fichier .env.production

Dans `frontend/`, copier `.env.production.example` en `.env.production` :

```bash
cp frontend/.env.production.example frontend/.env.production
```

Editer le fichier et remplacer le domaine :
```ini
VITE_API_URL=https://TON_DOMAINE.com/api
```

### 6.2 Construire le frontend

```bash
cd frontend
npm install
npm run build
```

> Cela cree le dossier `frontend/dist/` avec tous les fichiers HTML/CSS/JS optimises.
> Ce dossier est ce que les utilisateurs vont recevoir dans leur navigateur.

### 6.3 Envoyer le dossier dist sur le serveur

Depuis ta machine locale (remplacer les valeurs) :
```bash
scp -r frontend/dist palmeraie@TON_IP_SERVEUR:/home/palmeraie/app/frontend/
```

> Si scp n'est pas disponible sur Windows, utiliser WinSCP (logiciel graphique)
> ou FileZilla avec le protocole SFTP.

---

## PHASE 7 — Configurer Nginx

### 7.1 Creer la configuration Nginx

Sur le serveur, en tant que root :
```bash
nano /etc/nginx/sites-available/palmeraie
```

Contenu complet a coller (remplacer `TON_DOMAINE.com`) :
```nginx
server {
    listen 80;
    server_name TON_DOMAINE.com www.TON_DOMAINE.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name TON_DOMAINE.com www.TON_DOMAINE.com;

    # Certificats SSL — remplis automatiquement par Certbot (Phase 8)
    ssl_certificate /etc/letsencrypt/live/TON_DOMAINE.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/TON_DOMAINE.com/privkey.pem;

    # Frontend React (point d'entree)
    root /home/palmeraie/app/frontend/dist;
    index index.html;

    # Fichiers statiques Django (CSS/JS du panel admin)
    location /static/ {
        alias /home/palmeraie/app/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Fichiers medias uploades (photos, documents)
    location /media/ {
        alias /home/palmeraie/app/backend/media/;
    }

    # API Django — proxy vers Gunicorn
    location /api/ {
        proxy_pass http://unix:/home/palmeraie/app/backend/gunicorn.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
        client_max_body_size 10M;
    }

    # Django Admin — proxy vers Gunicorn
    location /admin/ {
        proxy_pass http://unix:/home/palmeraie/app/backend/gunicorn.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # React SPA — toutes les autres URLs chargent index.html
    # (necessaire pour que les routes /dashboard, /recoltes etc. fonctionnent)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 7.2 Activer la configuration et tester

```bash
ln -s /etc/nginx/sites-available/palmeraie /etc/nginx/sites-enabled/
nginx -t
```

Le resultat doit afficher :
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Si une erreur apparait, verifier le fichier de configuration et corriger avant de continuer.

---

## PHASE 8 — HTTPS avec Let's Encrypt (certificat SSL gratuit)

> **Prerequis obligatoire** : Le domaine `TON_DOMAINE.com` doit deja pointer vers
> l'IP du serveur. Verifier avec : `ping TON_DOMAINE.com` (doit repondre avec TON_IP_SERVEUR).

### 8.1 Obtenir le certificat SSL

```bash
certbot --nginx -d TON_DOMAINE.com -d www.TON_DOMAINE.com
```

Certbot va :
1. Verifier que le domaine pointe bien vers ce serveur
2. Generer le certificat SSL gratuitement
3. Modifier automatiquement la configuration Nginx pour activer HTTPS
4. Configurer le renouvellement automatique tous les 90 jours

Repondre aux questions :
- Email : entrer une adresse email valide (pour les alertes d'expiration)
- Conditions : accepter avec `Y`
- Redirection HTTP → HTTPS : choisir `2` (redirection automatique)

### 8.2 Demarrer et activer Nginx

```bash
systemctl restart nginx
systemctl enable nginx
```

---

## PHASE 9 — Taches automatiques (alertes quotidiennes)

L'application envoie des alertes tous les jours a 6h via `django-crontab`.

```bash
su - palmeraie
cd /home/palmeraie/app/backend
source venv/bin/activate
python manage.py crontab add
python manage.py crontab show
```

Resultat attendu : une ligne avec `0 6 * * * ...check_alerts`.

---

## PHASE 10 — Verifications finales

### 10.1 Checklist complete

```
[ ] https://TON_DOMAINE.com          --> Page de connexion (React)
[ ] https://TON_DOMAINE.com/api/health/  --> {"status": "ok"}
[ ] https://TON_DOMAINE.com/admin/   --> Interface admin Django (avec CSS)
[ ] http://TON_DOMAINE.com           --> Redirige vers https:// automatiquement
[ ] Connexion avec un compte superviseur fonctionne
[ ] Connexion avec le compte admin fonctionne
[ ] Notifications bell fonctionne
[ ] Les photos/images s'affichent correctement
[ ] Le bouton logout redirige vers la page de connexion
[ ] "Mot de passe oublié" envoie bien un email (verifier la boite mail + spams)
[ ] Le lien de reinitialisation dans l'email fonctionne et redirige vers le bon domaine
```

### 10.2 Commandes de diagnostic (si quelque chose ne marche pas)

```bash
# Statut des services
systemctl status palmeraie    # Django/Gunicorn
systemctl status nginx        # Nginx

# Logs Django (erreurs Python)
tail -f /home/palmeraie/app/backend/logs/error.log

# Logs Nginx (requetes)
tail -f /var/log/nginx/access.log

# Logs Nginx (erreurs)
tail -f /var/log/nginx/error.log

# Verifier que le socket Gunicorn existe
ls -la /home/palmeraie/app/backend/gunicorn.sock
```

---

## MISE A JOUR DE L'APPLICATION (apres modifications du code)

### Mettre a jour le backend

```bash
# Sur le serveur
su - palmeraie
cd /home/palmeraie/app
git pull
cd backend
source venv/bin/activate
pip install -r requirements.txt            # Si nouvelles dependances
python manage.py migrate                   # Si nouvelles migrations
python manage.py collectstatic --noinput   # Si nouveaux fichiers statiques
exit

# Redemarrer Django pour prendre en compte les modifications
systemctl restart palmeraie
```

### Mettre a jour le frontend

Sur ta machine locale :
```bash
cd frontend
npm run build
scp -r dist palmeraie@TON_IP_SERVEUR:/home/palmeraie/app/frontend/
```

Nginx reprend automatiquement les nouveaux fichiers sans redemarrage.

---

## PROBLEMES FREQUENTS ET SOLUTIONS

### L'API repond "502 Bad Gateway"
Gunicorn n'est pas demarre ou a plante.
```bash
systemctl status palmeraie
tail -f /home/palmeraie/app/backend/logs/error.log
systemctl restart palmeraie
```

### L'application affiche "Serveur indisponible"
L'URL de l'API dans le frontend ne correspond pas.
- Verifier que `VITE_API_URL` dans `frontend/.env.production` est `https://TON_DOMAINE.com/api`
- Reconstruire le frontend : `npm run build` puis recopier `dist/` sur le serveur

### L'admin Django s'affiche sans CSS (page blanche sans style)
La commande collectstatic n'a pas ete executee.
```bash
su - palmeraie
cd /home/palmeraie/app/backend
source venv/bin/activate
python manage.py collectstatic --noinput
```

### "DisallowedHost at /api/..."
Le domaine n'est pas dans ALLOWED_HOSTS.
- Ouvrir `/home/palmeraie/app/backend/.env`
- Verifier que `ALLOWED_HOSTS=TON_DOMAINE.com,www.TON_DOMAINE.com` (sans https://)
- Redemarrer : `systemctl restart palmeraie`

### "CSRF verification failed" sur l'admin Django
```bash
nano /home/palmeraie/app/backend/.env
# Verifier la ligne : CSRF_TRUSTED_ORIGINS=https://TON_DOMAINE.com,https://www.TON_DOMAINE.com
systemctl restart palmeraie
```

### Les routes React affichent "404 Not Found" (ex: /dashboard apres F5)
La configuration Nginx manque le fallback vers `index.html`.
Verifier que la section `location /` contient bien `try_files $uri $uri/ /index.html;`

### Erreur "could not connect to server" (base de donnees)
- Verifier que PostgreSQL tourne : `systemctl status postgresql`
- Verifier les credentials dans `.env` (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD)
- Verifier que l'utilisateur a bien les droits : `sudo -u postgres psql -c "\du"`

### Le lien "Mot de passe oublié" ne reçoit pas d'email

**Verifier les variables d'environnement :**
```bash
grep EMAIL /home/palmeraie/app/backend/.env
grep FRONTEND_URL /home/palmeraie/app/backend/.env
```
Les trois lignes `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` et `FRONTEND_URL` doivent etre presentes et non vides.

**Voir les erreurs d'envoi dans les logs :**
```bash
tail -50 /home/palmeraie/app/backend/logs/error.log
journalctl -u palmeraie --since "10 min ago"
```

**Causes frequentes :**
- `SMTPAuthenticationError (535)` : le mot de passe d'application Gmail est incorrect ou expire — en creer un nouveau (voir section 4.3.1)
- `Connection refused` sur le port 587 : l'hebergeur bloque le SMTP sortant — contacter le support ou utiliser un service tiers (SendGrid, Mailgun)
- `EMAIL_HOST_USER` vide : Django utilise le backend console, les emails n'est pas envoyes mais affiches dans les logs
- Lien de reinitialisation incorrect : verifier que `FRONTEND_URL=https://TON_DOMAINE.com` (sans slash final) correspond bien a l'URL reelle de l'application

Apres toute modification du `.env` :
```bash
systemctl restart palmeraie
```

---

*Guide prepare pour : Django 5.2 + React 19 + PostgreSQL + Nginx + Ubuntu 22.04*
