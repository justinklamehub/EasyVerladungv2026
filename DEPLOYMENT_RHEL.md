# Deployment-Anleitung – COMET LKW-Verladungsverwaltung
**Zielumgebung:** Red Hat Enterprise Linux Server 7.9 (Maipo)

---

## Inhaltsverzeichnis
1. [Voraussetzungen & Systemvorbereitung](#1-voraussetzungen--systemvorbereitung)
2. [Node.js 22 LTS installieren](#2-nodejs-22-lts-installieren)
3. [pnpm installieren](#3-pnpm-installieren)
4. [PostgreSQL 15 installieren](#4-postgresql-15-installieren)
5. [Nginx installieren](#5-nginx-installieren)
6. [Projektbenutzer & Projektverzeichnis anlegen](#6-projektbenutzer--projektverzeichnis-anlegen)
7. [Projekt klonen & Abhängigkeiten installieren](#7-projekt-klonen--abhängigkeiten-installieren)
8. [.env-Datei konfigurieren](#8-env-datei-konfigurieren)
9. [Datenbank einrichten & Schema pushen](#9-datenbank-einrichten--schema-pushen)
10. [Frontend bauen](#10-frontend-bauen)
11. [Backend bauen](#11-backend-bauen)
12. [PM2 als Prozessmanager einrichten](#12-pm2-als-prozessmanager-einrichten)
13. [Systemd-Service (Alternative zu PM2)](#13-systemd-service-alternative-zu-pm2)
14. [Nginx konfigurieren (inkl. WebSocket / Socket.IO)](#14-nginx-konfigurieren-inkl-websocket--socketio)
15. [SELinux konfigurieren](#15-selinux-konfigurieren)
16. [Firewall (firewalld) konfigurieren](#16-firewall-firewalld-konfigurieren)
17. [SSL/TLS mit Let's Encrypt (empfohlen)](#17-ssltls-mit-lets-encrypt-empfohlen)
18. [Updates deployen (Workflow)](#18-updates-deployen-workflow)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Voraussetzungen & Systemvorbereitung

```bash
# Als root einloggen oder sudo-Zugang sicherstellen
sudo -i

# System aktualisieren
yum update -y

# Basis-Tools installieren
yum install -y curl wget git tar unzip vim

# EPEL-Repository hinzufügen (für Certbot und weitere Pakete)
rpm -Uvh https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm

# Optional: Development Tools für native Node.js-Module
yum groupinstall -y "Development Tools"
yum install -y python3
```

---

## 2. Node.js 22 LTS installieren

```bash
# NodeSource-Repository für Node.js 22 einrichten
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -

# Node.js installieren
yum install -y nodejs

# Version prüfen (mind. v22.x)
node --version
npm --version
```

---

## 3. pnpm installieren

```bash
# pnpm global installieren
npm install -g pnpm

# Version prüfen
pnpm --version
```

---

## 4. PostgreSQL 15 installieren

```bash
# PGDG-Repository hinzufügen
yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# PostgreSQL 15 installieren
yum install -y postgresql15-server postgresql15

# Datenbank initialisieren
/usr/pgsql-15/bin/postgresql-15-setup initdb

# Autostart aktivieren & starten
systemctl enable postgresql-15
systemctl start postgresql-15

# Status prüfen
systemctl status postgresql-15
```

### PostgreSQL konfigurieren

```bash
# Als postgres-Benutzer einloggen
sudo -u postgres psql

-- In der psql-Shell:
-- Datenbank und Benutzer anlegen
CREATE DATABASE comet_lkw;
CREATE USER comet_app WITH ENCRYPTED PASSWORD 'SICHERES_PASSWORT_HIER';
GRANT ALL PRIVILEGES ON DATABASE comet_lkw TO comet_app;
\c comet_lkw
GRANT ALL ON SCHEMA public TO comet_app;
\q
```

### pg_hba.conf anpassen

```bash
vim /var/lib/pgsql/15/data/pg_hba.conf
```

Folgende Zeile hinzufügen (vor den bestehenden `host`-Einträgen):

```
host    comet_lkw    comet_app    127.0.0.1/32    md5
```

```bash
# PostgreSQL neu starten
systemctl restart postgresql-15

# Verbindung testen
psql -h 127.0.0.1 -U comet_app -d comet_lkw -c "SELECT 1;"
```

---

## 5. Nginx installieren

```bash
# Nginx-Repository für RHEL 7 anlegen
cat > /etc/yum.repos.d/nginx.repo << 'EOF'
[nginx-stable]
name=nginx stable repo
baseurl=http://nginx.org/packages/rhel/7/$basearch/
gpgcheck=1
enabled=1
gpgkey=https://nginx.org/keys/nginx_signing.key
module_hotfixes=true
EOF

# Nginx installieren
yum install -y nginx

# Autostart aktivieren & starten
systemctl enable nginx
systemctl start nginx

# Version prüfen
nginx -v
```

---

## 6. Projektbenutzer & Projektverzeichnis anlegen

```bash
# Dedizierten Systembenutzer anlegen (kein Login-Shell)
useradd -r -s /sbin/nologin -d /opt/comet comet

# Projektverzeichnis anlegen
mkdir -p /opt/comet/app
chown comet:comet /opt/comet/app
```

---

## 7. Projekt klonen & Abhängigkeiten installieren

```bash
# Als comet-Benutzer oder root mit sudo
cd /opt/comet/app

# Projekt klonen (Git-Repository URL anpassen)
git clone https://github.com/IHRE_ORG/comet-lkw.git .
# ODER: Tarball entpacken
# tar -xzf comet-lkw.tar.gz -C /opt/comet/app --strip-components=1

# Eigentümer setzen
chown -R comet:comet /opt/comet/app

# Abhängigkeiten installieren (als comet-Benutzer)
sudo -u comet pnpm install --frozen-lockfile
```

---

## 8. .env-Datei konfigurieren

```bash
# .env-Datei im API-Server-Verzeichnis anlegen
cat > /opt/comet/app/artifacts/api-server/.env << 'EOF'
# Laufzeitumgebung
NODE_ENV=production

# Server-Port (intern, Nginx proxyt davor)
PORT=8080

# Datenbank (anpassen: Passwort aus Schritt 4)
DATABASE_URL=postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw

# Session-Geheimnis (min. 32 zufällige Zeichen)
SESSION_SECRET=HIER_LANGEN_ZUFAELLIGEN_STRING_EINSETZEN

# Log-Level (production: warn oder error)
LOG_LEVEL=warn
EOF

# Berechtigungen einschränken (nur root und comet lesen)
chmod 640 /opt/comet/app/artifacts/api-server/.env
chown root:comet /opt/comet/app/artifacts/api-server/.env
```

### Sicheren SESSION_SECRET generieren

```bash
# Zufälligen 64-Zeichen-String erzeugen
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 9. Datenbank einrichten & Schema pushen

Das Projekt verwendet **Drizzle ORM** mit `drizzle-kit push` zum Anlegen aller Tabellen.

```bash
cd /opt/comet/app

# Schema in die Datenbank pushen (Tabellen erstellen)
export DATABASE_URL="postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw"
sudo -u comet -E pnpm --filter @workspace/db push

# Alternativ mit force-Flag (bei Konflikten):
# sudo -u comet -E pnpm --filter @workspace/db push-force
```

> **Hinweis:** Der `push`-Befehl ist idempotent — er kann bei Updates erneut ausgeführt werden, ohne bestehende Daten zu löschen.

---

## 10. Frontend bauen

Das Frontend (Vite/React) benötigt beim Build-Zeitpunkt zwei Umgebungsvariablen:

| Variable    | Wert                  | Beschreibung                              |
|-------------|-----------------------|-------------------------------------------|
| `BASE_PATH` | `/`                   | Basispfad, unter dem die App erreichbar ist |
| `PORT`      | beliebig (z.B. 3000)  | Nur für den Build-Prozess benötigt        |

```bash
cd /opt/comet/app

# Frontend bauen
sudo -u comet env \
  PORT=3000 \
  BASE_PATH="/" \
  NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build
```

Die fertigen statischen Dateien liegen danach unter:
```
/opt/comet/app/artifacts/comet-lkw/dist/public/
```

Nginx wird diese Dateien direkt ausliefern — kein Node.js-Prozess für das Frontend nötig.

---

## 11. Backend bauen

```bash
cd /opt/comet/app

# Backend kompilieren (esbuild-Bundle erstellen)
sudo -u comet pnpm --filter @workspace/api-server run build
```

Die kompilierten Dateien liegen danach unter:
```
/opt/comet/app/artifacts/api-server/dist/index.mjs
```

---

## 12. PM2 als Prozessmanager einrichten

PM2 überwacht den Backend-Prozess, startet ihn bei Absturz neu und überlebt Reboots.

```bash
# PM2 global installieren
npm install -g pm2

# PM2-Ecosystem-Konfiguration anlegen
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
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
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

# Log-Verzeichnis anlegen
mkdir -p /var/log/comet
chown comet:comet /var/log/comet

# PM2 starten
sudo -u comet pm2 start /opt/comet/app/ecosystem.config.cjs

# Status prüfen
sudo -u comet pm2 status
sudo -u comet pm2 logs comet-api --lines 20

# PM2 beim Systemstart automatisch starten
pm2 startup systemd -u comet --hp /home/comet
# Den ausgegebenen Befehl ausführen (systemctl enable pm2-comet)
sudo -u comet pm2 save
```

---

## 13. Systemd-Service (Alternative zu PM2)

Falls Sie PM2 nicht verwenden möchten:

```bash
cat > /etc/systemd/system/comet-api.service << 'EOF'
[Unit]
Description=COMET LKW-Verladungsverwaltung API
After=network.target postgresql-15.service
Requires=postgresql-15.service

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

# Sicherheitshärtung
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/log/comet

[Install]
WantedBy=multi-user.target
EOF

# Dienst aktivieren & starten
systemctl daemon-reload
systemctl enable comet-api
systemctl start comet-api

# Status prüfen
systemctl status comet-api
journalctl -u comet-api -f
```

---

## 14. Nginx konfigurieren (inkl. WebSocket / Socket.IO)

### Wichtig: WebSocket-Unterstützung für Socket.IO

Socket.IO benötigt sowohl HTTP-Long-Polling als auch WebSocket-Upgrades.
Die Nginx-Konfiguration muss beide Varianten unterstützen.

```bash
# Standardkonfiguration sichern
mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.bak

# Neue Konfiguration anlegen
cat > /etc/nginx/conf.d/comet.conf << 'EOF'
upstream comet_api {
    server 127.0.0.1:8080;
    keepalive 64;
}

server {
    listen 80;
    server_name IHRE_DOMAIN_ODER_IP;

    # Logs
    access_log /var/log/nginx/comet-access.log;
    error_log  /var/log/nginx/comet-error.log;

    # Maximale Upload-Größe
    client_max_body_size 10M;

    # ── Statisches Frontend (React/Vite) ──────────────────
    root /opt/comet/app/artifacts/comet-lkw/dist/public;
    index index.html;

    # Statische Assets mit langem Cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ── Socket.IO WebSocket + HTTP-Polling ────────────────
    # Muss VOR dem allgemeinen /api-Block stehen!
    location /api/socket.io/ {
        proxy_pass http://comet_api;
        proxy_http_version 1.1;

        # WebSocket-Upgrade
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts für lange Socket-Verbindungen
        proxy_read_timeout  86400s;
        proxy_send_timeout  86400s;
        proxy_connect_timeout 60s;

        proxy_buffering off;
        proxy_cache off;
    }

    # ── REST-API ───────────────────────────────────────────
    location /api/ {
        proxy_pass http://comet_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
    }

    # ── SPA-Fallback (alle anderen URLs → index.html) ─────
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Konfiguration prüfen
nginx -t

# Nginx neu laden
systemctl reload nginx
```

---

## 15. SELinux konfigurieren

RHEL 7 hat SELinux standardmäßig im **Enforcing**-Modus. Nginx benötigt Berechtigungen zum Proxying.

```bash
# SELinux-Status prüfen
getenforce

# Nginx erlauben, Netzwerkverbindungen aufzubauen (Proxy-Funktion)
setsebool -P httpd_can_network_connect 1

# Nginx erlauben, als Relay zu fungieren
setsebool -P httpd_can_network_relay 1

# Statische Dateien: SELinux-Kontext für das Web-Root setzen
semanage fcontext -a -t httpd_sys_content_t "/opt/comet/app/artifacts/comet-lkw/dist/public(/.*)?"
restorecon -Rv /opt/comet/app/artifacts/comet-lkw/dist/public

# Wenn semanage nicht verfügbar:
# yum install -y policycoreutils-python

# Testen: Wenn Nginx 502 zurückgibt, SELinux-Logs prüfen:
# ausearch -c 'nginx' --raw | audit2allow -M nginx-comet
# semodule -i nginx-comet.pp
```

---

## 16. Firewall (firewalld) konfigurieren

```bash
# Firewall-Status prüfen
systemctl status firewalld

# HTTP und HTTPS öffnen
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https

# Firewall neu laden
firewall-cmd --reload

# Offene Ports prüfen
firewall-cmd --list-all
```

> Der interne Backend-Port `8080` wird **nicht** direkt geöffnet — nur Nginx ist von außen erreichbar.

---

## 17. SSL/TLS mit Let's Encrypt (empfohlen)

```bash
# Certbot via EPEL installieren
yum install -y certbot python2-certbot-nginx

# Zertifikat anfordern (IHRE_DOMAIN anpassen)
certbot --nginx -d comet.ihre-domain.de

# Automatische Erneuerung einrichten
echo "0 3 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" \
  > /etc/cron.d/certbot-renew

# Manuelle Erneuerung testen
certbot renew --dry-run
```

Nach der Zertifikat-Ausstellung ergänzt Certbot automatisch die Nginx-Konfiguration mit `listen 443 ssl` und HTTPS-Redirect. Prüfen Sie danach die Socket.IO-Konfiguration: In `X-Forwarded-Proto: https` ist dann `wss://` statt `ws://` aktiv.

---

## 18. Updates deployen (Workflow)

Für jedes neue Release führen Sie diese Schritte aus:

```bash
cd /opt/comet/app

# 1. Neue Version holen
sudo -u comet git pull origin main
# ODER Tarball entpacken und ersetzen

# 2. Abhängigkeiten aktualisieren (falls package.json geändert)
sudo -u comet pnpm install --frozen-lockfile

# 3. Datenbank-Schema aktualisieren (neue Tabellen/Spalten)
export DATABASE_URL="postgresql://comet_app:PASSWORT@127.0.0.1:5432/comet_lkw"
sudo -u comet -E pnpm --filter @workspace/db push

# 4. Frontend neu bauen
sudo -u comet env PORT=3000 BASE_PATH="/" NODE_ENV=production \
  pnpm --filter @workspace/comet-lkw run build

# 5. Backend neu bauen
sudo -u comet pnpm --filter @workspace/api-server run build

# 6. Backend-Prozess neu starten
# Mit PM2:
sudo -u comet pm2 restart comet-api

# ODER mit Systemd:
# systemctl restart comet-api

# 7. Nginx neu laden (falls Konfiguration geändert)
nginx -t && systemctl reload nginx
```

---

## 19. Troubleshooting

### Verbindung testen

```bash
# Läuft der Backend-Prozess?
sudo -u comet pm2 status
# ODER:
systemctl status comet-api

# Lauscht das Backend auf Port 8080?
ss -tlnp | grep 8080

# Direkte API-Anfrage (ohne Nginx)
curl -s http://127.0.0.1:8080/api/auth/me

# Nginx → Backend-Proxy testen
curl -s http://localhost/api/auth/me

# Socket.IO-Endpunkt testen
curl -s "http://localhost/api/socket.io/?EIO=4&transport=polling"
```

### Log-Dateien

```bash
# Backend-Logs (PM2)
sudo -u comet pm2 logs comet-api --lines 50

# Backend-Logs (Systemd)
journalctl -u comet-api -n 50 --no-pager

# Nginx-Zugriffs-Log
tail -f /var/log/nginx/comet-access.log

# Nginx-Fehler-Log
tail -f /var/log/nginx/comet-error.log

# PostgreSQL-Log
journalctl -u postgresql-15 -n 30 --no-pager

# SELinux-Verweigerungen
ausearch -m avc -ts recent
```

### Häufige Probleme

| Problem | Ursache | Lösung |
|---|---|---|
| `502 Bad Gateway` | Backend läuft nicht | `pm2 restart comet-api` oder Backend-Logs prüfen |
| `502 Bad Gateway` (SELinux) | SELinux blockiert Nginx→Backend | `setsebool -P httpd_can_network_connect 1` |
| WebSocket fällt auf Polling zurück | Fehlende Upgrade-Header in Nginx | `/api/socket.io/`-Block in Nginx prüfen |
| `DATABASE_URL` Fehler | `.env`-Datei nicht gefunden | Pfad und Berechtigungen der `.env` prüfen |
| Frontend zeigt leere Seite | Falscher `BASE_PATH` beim Build | Build mit `BASE_PATH="/"` wiederholen |
| `Permission denied` auf Logs | SELinux-Kontext falsch | `restorecon -Rv /opt/comet/app/...` |
| Session geht nach Neustart verloren | `SESSION_SECRET` fehlt oder zu kurz | Mindestens 32-Zeichen-Secret in `.env` setzen |

### Datenbankverbindung testen

```bash
# Als App-Benutzer verbinden
psql postgresql://comet_app:PASSWORT@127.0.0.1:5432/comet_lkw -c "\dt"

# Verbindungsanzahl prüfen
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='comet_lkw';"
```

---

## Schnellreferenz: Wichtige Pfade

| Ressource | Pfad |
|---|---|
| Projektverzeichnis | `/opt/comet/app/` |
| Backend-Bundle | `/opt/comet/app/artifacts/api-server/dist/index.mjs` |
| Backend `.env` | `/opt/comet/app/artifacts/api-server/.env` |
| Frontend-Build | `/opt/comet/app/artifacts/comet-lkw/dist/public/` |
| Nginx-Konfiguration | `/etc/nginx/conf.d/comet.conf` |
| PM2-Ecosystem | `/opt/comet/app/ecosystem.config.cjs` |
| Backend-Logs (PM2) | `/var/log/comet/api.log` |
| Nginx-Logs | `/var/log/nginx/comet-*.log` |
| PostgreSQL-Daten | `/var/lib/pgsql/15/data/` |
