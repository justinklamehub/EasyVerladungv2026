# Deployment-Anleitung – COMET LKW-Verladungsverwaltung
**Zielumgebung:** Debian 12 (Bookworm) · Apache2 (bestehende Installation)

---

## Inhaltsverzeichnis
1. [Voraussetzungen & Systemvorbereitung](#1-voraussetzungen--systemvorbereitung)
2. [Node.js 22 LTS installieren](#2-nodejs-22-lts-installieren)
3. [pnpm installieren](#3-pnpm-installieren)
4. [PostgreSQL 15 installieren](#4-postgresql-15-installieren)
5. [Projektbenutzer & Projektverzeichnis anlegen](#5-projektbenutzer--projektverzeichnis-anlegen)
6. [Projekt klonen & Abhängigkeiten installieren](#6-projekt-klonen--abhängigkeiten-installieren)
7. [.env-Datei konfigurieren](#7-env-datei-konfigurieren)
8. [Datenbank einrichten & Schema pushen](#8-datenbank-einrichten--schema-pushen)
9. [Frontend bauen](#9-frontend-bauen)
10. [Backend bauen](#10-backend-bauen)
11. [PM2 als Prozessmanager einrichten](#11-pm2-als-prozessmanager-einrichten)
12. [Systemd-Service (Alternative zu PM2)](#12-systemd-service-alternative-zu-pm2)
13. [Apache2 konfigurieren (inkl. WebSocket / Socket.IO)](#13-apache2-konfigurieren-inkl-websocket--socketio)
14. [Firewall (ufw) konfigurieren](#14-firewall-ufw-konfigurieren)
15. [SSL/TLS mit Let's Encrypt (empfohlen)](#15-ssltls-mit-lets-encrypt-empfohlen)
16. [Updates deployen (Workflow)](#16-updates-deployen-workflow)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Voraussetzungen & Systemvorbereitung

```bash
# Als root oder mit sudo-Zugang
sudo -i

# System aktualisieren
apt update && apt upgrade -y

# Basis-Tools installieren
apt install -y curl wget git vim gnupg2 ca-certificates lsb-release
```

---

## 2. Node.js 22 LTS installieren

```bash
# NodeSource-Repository für Node.js 22 einrichten
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

# Node.js installieren
apt install -y nodejs

# Version prüfen (mind. v22.x)
node --version
npm --version
```

---

## 3. pnpm installieren

```bash
npm install -g pnpm

# Version prüfen
pnpm --version
```

---

## 4. PostgreSQL 15 installieren

> Überspringen, falls PostgreSQL bereits läuft — dann direkt Datenbank und Benutzer anlegen.

```bash
# PGDG-Repository hinzufügen
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg

echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

apt update
apt install -y postgresql-15

# Autostart aktivieren & starten
systemctl enable postgresql
systemctl start postgresql

# Status prüfen
systemctl status postgresql
```

### Datenbank und Benutzer anlegen

```bash
sudo -u postgres psql << 'SQL'
CREATE DATABASE comet_lkw;
CREATE USER comet_app WITH ENCRYPTED PASSWORD 'SICHERES_PASSWORT_HIER';
GRANT ALL PRIVILEGES ON DATABASE comet_lkw TO comet_app;
\c comet_lkw
GRANT ALL ON SCHEMA public TO comet_app;
SQL
```

### Datenbankdump einspielen (falls vorhanden)

Falls Sie einen Export aus Replit haben (`comet_lkw_export.sql`):

```bash
# Dump einspielen (überschreibt leere Datenbank mit allen Daten)
sudo -u postgres psql comet_lkw < /tmp/comet_lkw_export.sql

echo "Tabellen prüfen:"
psql postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw -c "\dt"
```

---

## 5. Projektbenutzer & Projektverzeichnis anlegen

```bash
useradd -r -s /sbin/nologin -d /opt/comet comet
mkdir -p /opt/comet/app
chown comet:comet /opt/comet/app
```

---

## 6. Projekt klonen & Abhängigkeiten installieren

```bash
cd /opt/comet/app

# Git-Repository klonen (URL anpassen)
git clone https://github.com/IHRE_ORG/comet-lkw.git .
# ODER Tarball entpacken:
# tar -xzf comet-lkw.tar.gz -C /opt/comet/app --strip-components=1

chown -R comet:comet /opt/comet/app

# Abhängigkeiten installieren
sudo -u comet pnpm install --frozen-lockfile
```

---

## 7. .env-Datei konfigurieren

```bash
cat > /opt/comet/app/artifacts/api-server/.env << 'EOF'
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw
SESSION_SECRET=HIER_LANGEN_ZUFAELLIGEN_STRING_EINSETZEN
LOG_LEVEL=warn
EOF

chmod 640 /opt/comet/app/artifacts/api-server/.env
chown root:comet /opt/comet/app/artifacts/api-server/.env
```

### Sicheren SESSION_SECRET generieren

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 8. Datenbank einrichten & Schema pushen

> Diesen Schritt überspringen, wenn Sie in Schritt 4 bereits einen Dump eingespielt haben — das Schema ist dann bereits vorhanden.

```bash
cd /opt/comet/app
export DATABASE_URL="postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw"
sudo -u comet -E pnpm --filter @workspace/db push
```

---

## 9. Frontend bauen

```bash
cd /opt/comet/app
sudo -u comet env \
  PORT=3000 \
  BASE_PATH="/" \
  NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build
```

Statische Dateien liegen danach unter:
```
/opt/comet/app/artifacts/comet-lkw/dist/public/
```

---

## 10. Backend bauen

```bash
cd /opt/comet/app
sudo -u comet pnpm --filter @workspace/api-server run build
```

---

## 11. PM2 als Prozessmanager einrichten

```bash
npm install -g pm2

cat > /opt/comet/app/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: "comet-api",
      script: "./dist/index.mjs",
      cwd: "/opt/comet/app/artifacts/api-server",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      instances: 1,
      exec_mode: "fork",
      user: "comet",
      env_file: "/opt/comet/app/artifacts/api-server/.env",
      log_file: "/var/log/comet/api.log",
      error_file: "/var/log/comet/api-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: "512M",
      restart_delay: 3000,
      watch: false,
    },
  ],
};
EOF

mkdir -p /var/log/comet
chown comet:comet /var/log/comet

sudo -u comet pm2 start /opt/comet/app/ecosystem.config.cjs
sudo -u comet pm2 status

# Autostart beim Systemstart
pm2 startup systemd -u comet --hp /home/comet
# Den ausgegebenen Befehl ausführen (z.B. systemctl enable pm2-comet)
sudo -u comet pm2 save
```

---

## 12. Systemd-Service (Alternative zu PM2)

```bash
cat > /etc/systemd/system/comet-api.service << 'EOF'
[Unit]
Description=COMET LKW-Verladungsverwaltung API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=comet
Group=comet
WorkingDirectory=/opt/comet/app/artifacts/api-server
EnvironmentFile=/opt/comet/app/artifacts/api-server/.env
ExecStart=/usr/bin/node --enable-source-maps /opt/comet/app/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=comet-api
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable comet-api
systemctl start comet-api
systemctl status comet-api
```

---

## 13. Apache2 konfigurieren (inkl. WebSocket / Socket.IO)

### Schritt 1: Benötigte Module aktivieren

```bash
# Proxy-Module (HTTP + WebSocket)
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel   # <-- Pflicht für Socket.IO WebSocket!
a2enmod rewrite
a2enmod headers
a2enmod expires

# Apache neu laden
systemctl reload apache2

# Aktive Module prüfen
apache2ctl -M | grep -E "proxy|rewrite|headers|expires"
```

### Schritt 2: VirtualHost-Konfiguration anlegen

```bash
cat > /etc/apache2/sites-available/comet.conf << 'EOF'
<VirtualHost *:80>
    ServerName IHRE_DOMAIN_ODER_IP
    ServerAdmin admin@ihre-domain.de

    # Logs
    ErrorLog  ${APACHE_LOG_DIR}/comet-error.log
    CustomLog ${APACHE_LOG_DIR}/comet-access.log combined

    # ── Statisches Frontend (React/Vite Build) ──────────────
    DocumentRoot /opt/comet/app/artifacts/comet-lkw/dist/public

    <Directory "/opt/comet/app/artifacts/comet-lkw/dist/public">
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted

        # Cache für statische Assets (JS/CSS/Bilder)
        <FilesMatch "\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$">
            ExpiresActive On
            ExpiresDefault "access plus 1 year"
            Header set Cache-Control "public, immutable"
        </FilesMatch>

        # SPA-Fallback: Alle unbekannten Pfade → index.html
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # ── Socket.IO WebSocket-Verbindungen ────────────────────
    # WICHTIG: Muss VOR dem allgemeinen /api-Block stehen!
    #
    # Wenn der Browser ein WebSocket-Upgrade sendet:
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/api/socket\.io/(.*)$ ws://localhost:8080/api/socket.io/$1 [P,L]

    # Socket.IO HTTP-Polling (Fallback, wenn WebSocket nicht verfügbar)
    ProxyPass        /api/socket.io/ http://localhost:8080/api/socket.io/ nocanon
    ProxyPassReverse /api/socket.io/ http://localhost:8080/api/socket.io/

    # ── REST-API ────────────────────────────────────────────
    ProxyPass        /api/ http://localhost:8080/api/
    ProxyPassReverse /api/ http://localhost:8080/api/

    # Proxy-Header weiterleiten
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"

    # Timeouts für lange Socket-Verbindungen
    ProxyTimeout 86400

</VirtualHost>
EOF
```

### Schritt 3: Site aktivieren & Apache testen

```bash
# Site aktivieren
a2ensite comet.conf

# Konfiguration prüfen (darf kein Fehler kommen!)
apache2ctl configtest

# Apache neu laden
systemctl reload apache2
```

### Schritt 4: Dateiberechtigungen für Apache setzen

```bash
# Apache (www-data) braucht Lesezugriff auf die statischen Dateien
chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public
```

---

## 14. Firewall (ufw) konfigurieren

```bash
# ufw aktivieren (falls nicht aktiv)
ufw enable

# HTTP und HTTPS öffnen
ufw allow http
ufw allow https

# SSH sicherstellen (wichtig, sonst sperren Sie sich aus!)
ufw allow ssh

# Status prüfen
ufw status verbose
```

> Port `8080` (Backend) wird **nicht** direkt geöffnet — nur Apache ist von außen erreichbar.

---

## 15. SSL/TLS mit Let's Encrypt (empfohlen)

```bash
# Certbot und Apache-Plugin installieren
apt install -y certbot python3-certbot-apache

# Zertifikat anfordern (IHRE_DOMAIN anpassen)
certbot --apache -d comet.ihre-domain.de

# Automatische Erneuerung testen
certbot renew --dry-run
```

Certbot ergänzt automatisch die Apache-Konfiguration mit `<VirtualHost *:443>` und HTTPS-Redirect.

**Nach SSL:** `X-Forwarded-Proto` in der HTTPS-VirtualHost auf `https` setzen:

```apache
RequestHeader set X-Forwarded-Proto "https"
```

---

## 16. Updates deployen (Workflow)

```bash
cd /opt/comet/app

# 1. Neue Version holen
sudo -u comet git pull origin main

# 2. Abhängigkeiten aktualisieren (falls geändert)
sudo -u comet pnpm install --frozen-lockfile

# 3. Schema aktualisieren (neue Tabellen / Spalten)
export DATABASE_URL="postgresql://comet_app:PASSWORT@127.0.0.1:5432/comet_lkw"
sudo -u comet -E pnpm --filter @workspace/db push

# 4. Frontend neu bauen
sudo -u comet env PORT=3000 BASE_PATH="/" NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build

# 5. Backend neu bauen
sudo -u comet pnpm --filter @workspace/api-server run build

# 6. Backend neu starten
# PM2:
sudo -u comet pm2 restart comet-api
# ODER Systemd:
# systemctl restart comet-api

# 7. Apache neu laden (falls Konfiguration geändert)
apache2ctl configtest && systemctl reload apache2
```

---

## 17. Troubleshooting

### Verbindung testen

```bash
# Läuft das Backend auf Port 8080?
ss -tlnp | grep 8080

# Direkter API-Test (ohne Apache)
curl -s http://127.0.0.1:8080/api/auth/me

# Über Apache testen
curl -s http://localhost/api/auth/me

# Socket.IO-Endpunkt testen (HTTP-Polling)
curl -s "http://localhost/api/socket.io/?EIO=4&transport=polling"
# Erwartete Antwort: 0{"sid":"...","upgrades":["websocket"],...}
```

### Log-Dateien

```bash
# Backend (PM2)
sudo -u comet pm2 logs comet-api --lines 50

# Backend (Systemd)
journalctl -u comet-api -n 50 --no-pager

# Apache-Zugriffs-Log
tail -f /var/log/apache2/comet-access.log

# Apache-Fehler-Log (wichtigste Quelle bei 502/503)
tail -f /var/log/apache2/comet-error.log

# PostgreSQL
journalctl -u postgresql -n 30 --no-pager
```

### Häufige Probleme

| Problem | Ursache | Lösung |
|---|---|---|
| `502 Bad Gateway` | Backend läuft nicht | `pm2 restart comet-api` / Backend-Logs prüfen |
| `403 Forbidden` auf Frontend | Apache hat keinen Lesezugriff | `chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public` |
| WebSocket fällt auf Polling zurück | `proxy_wstunnel` nicht aktiv | `a2enmod proxy_wstunnel && systemctl reload apache2` |
| Seite lädt, aber `/api` gibt 404 | `proxy` / `proxy_http` fehlt | `a2enmod proxy proxy_http && systemctl reload apache2` |
| SPA-Routing kaputt (404 bei direktem URL) | `RewriteEngine` nicht aktiv | `a2enmod rewrite` + Directory-Block prüfen |
| Frontend zeigt leere Seite | Falscher `BASE_PATH` beim Build | Build mit `BASE_PATH="/"` wiederholen |
| Session geht verloren | `SESSION_SECRET` fehlt | `.env` prüfen, Backend neu starten |
| `AH00526: Syntax error` | Tippfehler in conf-Datei | `apache2ctl configtest` zeigt genaue Zeile |

### WebSocket-Verbindung debuggen

```bash
# WebSocket-Upgrade-Header prüfen
curl -s -I \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  http://localhost/api/socket.io/?EIO=4&transport=websocket

# Aktive Proxy-Module auflisten
apache2ctl -M | grep proxy
```

---

## 18. Update auf bestehender Installation (ohne Datenverlust)

> **Voraussetzung:** Das System läuft bereits gemäß dieser Anleitung unter `/opt/comet/app/` mit PM2 und Apache2.  
> Alle Schritte als Benutzer **root** oder mit `sudo` ausführen, sofern nicht anders angegeben.

### Schritt 1 — Datenbank sichern (Pflicht vor jedem Update)

```bash
# Backup erstellen (als postgres-Benutzer)
sudo -u postgres pg_dump cometdb > /opt/comet/backups/cometdb_$(date +%Y%m%d_%H%M%S).sql

# Verzeichnis anlegen falls noch nicht vorhanden
mkdir -p /opt/comet/backups
sudo -u postgres pg_dump cometdb > /opt/comet/backups/cometdb_$(date +%Y%m%d_%H%M%S).sql

# Backup prüfen (Größe > 0 = OK)
ls -lh /opt/comet/backups/
```

### Schritt 2 — Neuen Code holen

```bash
cd /opt/comet/app

# Als comet-Benutzer
sudo -u comet git pull origin main
```

### Schritt 3 — Abhängigkeiten aktualisieren

```bash
sudo -u comet pnpm install --frozen-lockfile
```

### Schritt 4 — Datenbank-Migration: Benachrichtigungen-Tabelle anlegen

Dieser Schritt ist **idempotent** (`IF NOT EXISTS`) — er schadet nicht, wenn die Tabelle bereits existiert, und legt sie an wenn sie fehlt. **Bestehende Daten bleiben vollständig erhalten.**

```bash
sudo -u postgres psql cometdb <<'SQL'
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT NOT NULL DEFAULT 'info',
  link_to     TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

SELECT 'notifications-Tabelle OK' AS status;
SQL
```

Erwartete Ausgabe: `notifications-Tabelle OK`

### Schritt 5 — Frontend neu bauen

```bash
cd /opt/comet/app
sudo -u comet env PORT=3000 BASE_PATH="/" NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build

# Apache Lesezugriff sicherstellen
chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public
```

### Schritt 6 — Backend neu bauen

```bash
sudo -u comet pnpm --filter @workspace/api-server run build
```

### Schritt 7 — Dienst neu starten

```bash
# Mit PM2
sudo -u comet pm2 restart comet-api
sudo -u comet pm2 save

# ODER mit Systemd
sudo systemctl restart comet-api
```

### Schritt 8 — Prüfen ob alles läuft

```bash
# Backend-Status
sudo -u comet pm2 status
# ODER
sudo systemctl status comet-api

# Backend direkt testen
curl -s http://127.0.0.1:8080/api/auth/me
# Erwartete Antwort: {"error":"Nicht angemeldet"} (kein 502!)

# Apache-Log auf Fehler prüfen
tail -20 /var/log/apache2/comet-error.log
```

### Was passiert mit den Daten?

| Datenbankinhalt | Verhalten beim Update |
|---|---|
| Benutzer, Rollen, Speditionen | ✅ Unverändert |
| Verladungen / Shipments | ✅ Unverändert |
| Palettenbewegungen & Abstimmungen | ✅ Unverändert |
| Audit-Log | ✅ Unverändert |
| Neue `notifications`-Tabelle | ✅ Wird neu angelegt (leer) — kein Konflikt |

### Rollback (falls etwas schiefgeht)

```bash
# Code zurücksetzen
cd /opt/comet/app
sudo -u comet git log --oneline -5   # gewünschten Commit-Hash notieren
sudo -u comet git checkout <COMMIT-HASH>

# Datenbank wiederherstellen (nur falls nötig)
sudo -u postgres psql -c "DROP DATABASE cometdb;"
sudo -u postgres psql -c "CREATE DATABASE cometdb OWNER comet;"
sudo -u postgres psql cometdb < /opt/comet/backups/cometdb_DATUM_UHRZEIT.sql

# Neu bauen und starten
sudo -u comet pnpm install --frozen-lockfile
sudo -u comet pnpm --filter @workspace/api-server run build
sudo -u comet env PORT=3000 BASE_PATH="/" NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build
chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public
sudo -u comet pm2 restart comet-api
```

---

## Schnellreferenz: Wichtige Pfade & Befehle

| Ressource | Pfad / Befehl |
|---|---|
| Projektverzeichnis | `/opt/comet/app/` |
| Backend-Bundle | `/opt/comet/app/artifacts/api-server/dist/index.mjs` |
| Backend `.env` | `/opt/comet/app/artifacts/api-server/.env` |
| Frontend-Build | `/opt/comet/app/artifacts/comet-lkw/dist/public/` |
| Apache-Konfiguration | `/etc/apache2/sites-available/comet.conf` |
| Apache-Module aktivieren | `a2enmod proxy proxy_http proxy_wstunnel rewrite headers` |
| Konfiguration testen | `apache2ctl configtest` |
| Apache neu laden | `systemctl reload apache2` |
| Backend-Logs (PM2) | `pm2 logs comet-api` |
| Apache-Fehler-Log | `/var/log/apache2/comet-error.log` |

---

## Apache-Module auf einen Blick

| Modul | Wozu |
|---|---|
| `proxy` | Grundlage für alle Proxy-Funktionen |
| `proxy_http` | HTTP-Proxy (REST-API → Backend) |
| `proxy_wstunnel` | **WebSocket-Proxy (Socket.IO)** — Pflicht! |
| `rewrite` | URL-Rewriting (WebSocket-Routing + SPA-Fallback) |
| `headers` | `X-Forwarded-*`-Header setzen |
| `expires` | Cache-Header für statische Assets |
| `ssl` | HTTPS (wird von Certbot automatisch aktiviert) |
