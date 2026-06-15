# Deployment-Anleitung — COMET LKW-Verladungsverwaltung

Zielumgebung: **Debian 12 / Ubuntu 22.04 LTS** · Nginx als Reverse Proxy · PostgreSQL · PM2 oder Systemd · WebSocket (Socket.IO)

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Node.js & pnpm installieren](#2-nodejs--pnpm-installieren)
3. [PostgreSQL einrichten](#3-postgresql-einrichten)
4. [Anwendung auf den Server übertragen](#4-anwendung-auf-den-server-übertragen)
5. [Abhängigkeiten installieren & bauen](#5-abhängigkeiten-installieren--bauen)
6. [Umgebungsvariablen (.env)](#6-umgebungsvariablen-env)
7. [Datenbank initialisieren & seeden](#7-datenbank-initialisieren--seeden)
8. [Prozess-Management mit PM2](#8-prozess-management-mit-pm2)
9. [Prozess-Management mit Systemd (Alternative)](#9-prozess-management-mit-systemd-alternative)
10. [Nginx konfigurieren](#10-nginx-konfigurieren)
11. [TLS/HTTPS mit Let's Encrypt](#11-tlshttps-mit-lets-encrypt)
12. [Firewall](#12-firewall)
13. [Updates einspielen](#13-updates-einspielen)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Voraussetzungen

- Root- oder sudo-Zugang zum VPS
- Domain oder Subdomain, die auf die Server-IP zeigt (für TLS)
- Mindestens **1 GB RAM**, **10 GB Festplatte** empfohlen

---

## 2. Node.js & pnpm installieren

```bash
# Node.js 22 LTS über NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Version prüfen
node -v   # sollte v22.x.x ausgeben

# pnpm global installieren
sudo npm install -g pnpm@latest

# pnpm Version prüfen
pnpm -v
```

---

## 3. PostgreSQL einrichten

```bash
sudo apt-get install -y postgresql postgresql-contrib

# PostgreSQL starten & autostart aktivieren
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Datenbank und Benutzer anlegen
sudo -u postgres psql <<'SQL'
CREATE USER comet_user WITH PASSWORD 'SICHERES_PASSWORT_HIER';
CREATE DATABASE comet_lkw OWNER comet_user;
GRANT ALL PRIVILEGES ON DATABASE comet_lkw TO comet_user;
SQL
```

> **Wichtig:** Ersetze `SICHERES_PASSWORT_HIER` mit einem echten, zufälligen Passwort.

---

## 4. Anwendung auf den Server übertragen

### Option A – Git (empfohlen)

```bash
# Anwendungsverzeichnis anlegen
sudo mkdir -p /opt/comet-lkw
sudo chown $USER:$USER /opt/comet-lkw

cd /opt/comet-lkw
git clone https://DEIN_GIT_REPO_URL.git .
```

### Option B – manueller Upload (rsync)

```bash
# Lokal ausführen – überträgt das komplette Projektverzeichnis
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
  ./ user@DEINE_SERVER_IP:/opt/comet-lkw/
```

---

## 5. Abhängigkeiten installieren & bauen

```bash
cd /opt/comet-lkw

# Alle Workspace-Abhängigkeiten installieren (frozen lockfile für Produktion)
pnpm install --frozen-lockfile

# API-Server bauen (esbuild → dist/index.mjs)
pnpm --filter @workspace/api-server run build

# Frontend bauen (Vite → artifacts/comet-lkw/dist/public/)
# BASE_PATH und PORT müssen beim Build gesetzt sein
BASE_PATH="/" PORT=3000 pnpm --filter @workspace/comet-lkw run build
```

> `BASE_PATH` ist der Pfad, unter dem das Frontend erreichbar ist.  
> Wenn die App unter `https://example.com/` läuft → `BASE_PATH="/"`  
> Wenn unter `https://example.com/comet/` → `BASE_PATH="/comet/"`

---

## 6. Umgebungsvariablen (.env)

Lege die Datei `/opt/comet-lkw/artifacts/api-server/.env` an:

```bash
sudo nano /opt/comet-lkw/artifacts/api-server/.env
```

Inhalt:

```env
# Laufzeitumgebung
NODE_ENV=production

# Server-Port (intern, Nginx leitet weiter)
PORT=8080

# PostgreSQL-Verbindung
DATABASE_URL=postgresql://comet_user:SICHERES_PASSWORT_HIER@localhost:5432/comet_lkw

# Session-Secret – mindestens 32 zufällige Zeichen!
# Generieren: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=HIER_LANGEN_ZUFALLSSTRING_EINTRAGEN

# Log-Level (error | warn | info | debug)
LOG_LEVEL=info
```

Datei absichern (nur root darf lesen):

```bash
chmod 600 /opt/comet-lkw/artifacts/api-server/.env
```

> Die `.env`-Datei wird beim Start automatisch vom API-Server geladen.  
> Falls dein Loader dotenv nicht eingebaut hat, installiere es:  
> `pnpm --filter @workspace/api-server add dotenv`  
> und füge `import 'dotenv/config'` ganz oben in `src/index.ts` ein.

---

## 7. Datenbank initialisieren & seeden

```bash
cd /opt/comet-lkw

# Drizzle-Schema auf die Datenbank anwenden (Tabellen erstellen)
DATABASE_URL="postgresql://comet_user:SICHERES_PASSWORT_HIER@localhost:5432/comet_lkw" \
  pnpm --filter @workspace/db run push

# Seed-Daten einspielen (Rollen, Berechtigungen, Admin-Benutzer)
cd artifacts/api-server
DATABASE_URL="postgresql://comet_user:SICHERES_PASSWORT_HIER@localhost:5432/comet_lkw" \
  npx tsx src/seed.ts
```

---

## 8. Prozess-Management mit PM2

PM2 startet den API-Server automatisch neu nach Abstürzen und beim Serverstart.

```bash
# PM2 global installieren
sudo npm install -g pm2

# API-Server mit PM2 starten
pm2 start /opt/comet-lkw/artifacts/api-server/dist/index.mjs \
  --name "comet-api" \
  --node-args "--enable-source-maps" \
  --env-file /opt/comet-lkw/artifacts/api-server/.env \
  --restart-delay 3000 \
  --max-restarts 10

# Status prüfen
pm2 status
pm2 logs comet-api

# PM2 beim Systemstart automatisch laden
pm2 startup
# → den ausgegebenen Befehl ausführen (sudo env PATH=...)
pm2 save
```

### Nützliche PM2-Befehle

```bash
pm2 restart comet-api    # Neustart
pm2 stop comet-api       # Stoppen
pm2 delete comet-api     # Entfernen
pm2 logs comet-api       # Live-Logs
pm2 monit                # Dashboard
```

---

## 9. Prozess-Management mit Systemd (Alternative)

Wenn du kein PM2 möchtest, kannst du einen Systemd-Service verwenden:

```bash
sudo nano /etc/systemd/system/comet-api.service
```

Inhalt:

```ini
[Unit]
Description=COMET LKW API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/comet-lkw/artifacts/api-server
EnvironmentFile=/opt/comet-lkw/artifacts/api-server/.env
ExecStart=/usr/bin/node --enable-source-maps /opt/comet-lkw/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=comet-api

[Install]
WantedBy=multi-user.target
```

```bash
# Verzeichnis-Rechte setzen
sudo chown -R www-data:www-data /opt/comet-lkw

# Service aktivieren und starten
sudo systemctl daemon-reload
sudo systemctl enable comet-api
sudo systemctl start comet-api

# Status prüfen
sudo systemctl status comet-api
sudo journalctl -u comet-api -f   # Live-Logs
```

---

## 10. Nginx konfigurieren

Der API-Server läuft auf Port **8080** (intern). Nginx übernimmt:
- Auslieferung des statischen Frontend-Builds
- Weiterleitung von `/api/...` an den API-Server
- WebSocket-Upgrade für Socket.IO

```bash
sudo apt-get install -y nginx

sudo nano /etc/nginx/sites-available/comet-lkw
```

Inhalt (ersetze `DEINE_DOMAIN.de`):

```nginx
upstream comet_api {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name DEINE_DOMAIN.de;

    # Statisches Frontend
    root /opt/comet-lkw/artifacts/comet-lkw/dist/public;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Cache für Assets (Vite erzeugt Content-Hashes)
    location ~* \.(js|css|png|jpg|svg|ico|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API-Anfragen an Express weiterleiten
    location /api/ {
        proxy_pass http://comet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket-Support für Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Socket.IO Endpoint (falls unter /socket.io/)
    location /socket.io/ {
        proxy_pass http://comet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # SPA Fallback – alle anderen Pfade liefern index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Konfiguration aktivieren und testen
sudo ln -s /etc/nginx/sites-available/comet-lkw /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 11. TLS/HTTPS mit Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx

# Zertifikat ausstellen (ersetzt die HTTP-Konfiguration automatisch)
sudo certbot --nginx -d DEINE_DOMAIN.de

# Automatische Erneuerung testen
sudo certbot renew --dry-run
```

Certbot fügt automatisch HTTPS-Konfiguration und Weiterleitung HTTP→HTTPS hinzu.

---

## 12. Firewall

```bash
sudo apt-get install -y ufw

sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Internen API-Port NICHT nach außen öffnen – Nginx übernimmt
# sudo ufw deny 8080   ← optional, ist standardmäßig geblockt

sudo ufw enable
sudo ufw status
```

---

## 13. Updates einspielen

```bash
cd /opt/comet-lkw

# Neue Version holen
git pull

# Abhängigkeiten aktualisieren
pnpm install --frozen-lockfile

# API-Server neu bauen
pnpm --filter @workspace/api-server run build

# Frontend neu bauen
BASE_PATH="/" PORT=3000 pnpm --filter @workspace/comet-lkw run build

# Falls Datenbank-Schema geändert wurde
DATABASE_URL="postgresql://comet_user:PASSWORT@localhost:5432/comet_lkw" \
  pnpm --filter @workspace/db run push

# Prozess neu starten
pm2 restart comet-api
# ODER mit Systemd:
# sudo systemctl restart comet-api
```

---

## 14. Troubleshooting

### API-Server startet nicht

```bash
# Logs ansehen
pm2 logs comet-api --lines 50
# oder Systemd:
sudo journalctl -u comet-api -n 50

# Häufige Ursachen:
# - DATABASE_URL falsch → PostgreSQL-Verbindung schlägt fehl
# - SESSION_SECRET nicht gesetzt
# - PORT bereits belegt: sudo lsof -i :8080
```

### Nginx 502 Bad Gateway

```bash
# Prüfen ob API-Server läuft
pm2 status
curl http://localhost:8080/api/auth/me

# Nginx-Fehlerlog
sudo tail -f /var/log/nginx/error.log
```

### WebSocket-Verbindung bricht ab

Sicherstellen, dass in der Nginx-Konfiguration:
- `proxy_http_version 1.1;` gesetzt ist
- `Upgrade` und `Connection` Header weitergeleitet werden
- `proxy_read_timeout` groß genug ist (86400s)

Bei Nginx hinter einem Load Balancer (z.B. Hetzner LB): Sticky Sessions aktivieren.

### Frontend zeigt leere Seite

```bash
# Prüfen ob dist/public vorhanden ist
ls /opt/comet-lkw/artifacts/comet-lkw/dist/public/

# Nginx-Konfiguration prüfen (root-Pfad korrekt?)
sudo nginx -T | grep root
```

### Datenbankverbindung schlägt fehl

```bash
# Verbindung manuell testen
psql postgresql://comet_user:PASSWORT@localhost:5432/comet_lkw -c "\dt"

# PostgreSQL läuft?
sudo systemctl status postgresql
```

---

## Schnellreferenz: Wichtige Pfade

| Was | Pfad |
|-----|------|
| Projektverzeichnis | `/opt/comet-lkw/` |
| API-Server Build | `/opt/comet-lkw/artifacts/api-server/dist/index.mjs` |
| Frontend Build | `/opt/comet-lkw/artifacts/comet-lkw/dist/public/` |
| .env-Datei | `/opt/comet-lkw/artifacts/api-server/.env` |
| Nginx-Konfiguration | `/etc/nginx/sites-available/comet-lkw` |
| Nginx-Logs | `/var/log/nginx/access.log` · `/var/log/nginx/error.log` |
| PostgreSQL-Daten | `/var/lib/postgresql/` |
