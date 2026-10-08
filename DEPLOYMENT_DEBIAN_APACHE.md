# Deployment-Anleitung – COMET LKW-Verladungsverwaltung
**Zielumgebung:** Debian 12 (Bookworm) · Apache2 (bestehende Installation)

> **Bestehender Server:** Für normale Updates ausschließlich [Abschnitt 16](#16-updates-deployen-workflow) verwenden. Die Installationsschritte unten sind für eine neue Instanz, nicht zum erneuten Einrichten des laufenden Servers. Vorhandene Benutzer, Datenbanken, Speicherpfade und Dienste nicht ersetzen.
>
> **Geprüfter Debian-Betrieb:** Benutzer `comet`, Home `/opt/comet`, PM2-Verzeichnis `/opt/comet/.pm2`, API-Arbeitsverzeichnis `/opt/comet/app`, Port `3333`. Auf der vorhandenen Instanz laufen Node 24, pnpm 11.7.0 und PostgreSQL 18. Die älteren Versionsbeispiele unten sind kein Auftrag zum Downgrade.
>
> Systemänderungen über `sudo` durchführen. Die API selbst und alle App-/Update-Befehle laufen unprivilegiert als `comet`. Andere Websites, root-PM2-Anwendungen und den laufenden PostgreSQL-Cluster nicht stoppen. Der bestätigte Update-Lauf ersetzt keinen vollständigen Server-Reboot-Test.

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
18. [Bestehende Installation lesend prüfen](#18-bestehende-installation-lesend-prüfen)

---

## 1. Voraussetzungen & Systemvorbereitung

```bash
# Als root oder mit sudo-Zugang
sudo -i

# System aktualisieren
apt update
# Kein pauschales Betriebssystem-Upgrade auf dem gemeinsam genutzten Server.

# Basis-Tools installieren
apt install -y curl wget git vim gnupg2 ca-certificates lsb-release
```

---

## 2. Node.js 22 LTS installieren

Nur auf einer neuen Instanz ohne geeigneten Node installieren. Auf dem bestehenden Server Node 24 beibehalten. Keine root-NVM-Pfade für den App-Dienst übernehmen.

```bash
# NodeSource-Repository für Node.js 22 einrichten
sudo curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -

# Node.js installieren
sudo apt install -y nodejs

# Version prüfen (mind. v22.x)
sudo node --version
sudo npm --version
```

---

## 3. pnpm installieren

Bereits installiertes pnpm zunächst als App-Benutzer prüfen, sobald dieser eingerichtet ist. Unterstützt wird `allowBuilds` ab pnpm 10.26; für pnpm 11 ist das frühere `onlyBuiltDependencies` nicht mehr gültig. Die gezielten Freigaben stehen im Git-Repository. Nicht pauschal alle Installationsskripte erlauben.

Nur auf einer neuen Instanz ohne pnpm:

```bash
sudo npm install -g pnpm@11.7.0

# Version prüfen
sudo pnpm --version
```

---

## 4. PostgreSQL 15 installieren

> Überspringen, falls PostgreSQL bereits läuft. Bei einer bestehenden COMET-Instanz auch **keine neue Datenbank oder Benutzerrolle anlegen und keinen Dump importieren**. Der vorhandene Debian-Cluster verwendet PostgreSQL 18; ihn nicht durch PostgreSQL 15 ersetzen oder neu initialisieren. Bei einem Umzug muss die Zielversion zum vorhandenen Dump passen.

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

Nur für eine neue Instanz; vorhandenen Benutzer und vorhandene Verzeichnisse nicht ungeprüft ändern. Home und PM2-Verzeichnis müssen übereinstimmen.

```bash
sudo useradd --system --user-group --home-dir /opt/comet \
  --no-create-home --shell /usr/sbin/nologin comet
sudo install -d -o comet -g comet -m 755 \
  /opt/comet /opt/comet/app /opt/comet/releases /var/log/comet
sudo install -d -o comet -g comet -m 700 \
  /opt/comet/.pm2 /opt/comet/backups /opt/comet/app/.comet-operations

# Tatsächliches Home prüfen; erwartet: /opt/comet
sudo getent passwd comet

# Als App-Benutzer, ohne root-NVM:
sudo -H -u comet env PATH=/usr/local/bin:/usr/bin:/bin \
  sh -c 'command -v node; node --version; command -v pnpm; pnpm --version'
```

---

## 6. Projekt klonen & Abhängigkeiten installieren

```bash
cd /opt/comet/app

# Git-Repository klonen (URL anpassen)
sudo -H -u comet git clone https://github.com/IHRE_ORG/comet-lkw.git .
# ODER Tarball entpacken:
# tar -xzf comet-lkw.tar.gz -C /opt/comet/app --strip-components=1

# Abhängigkeiten installieren
sudo -H -u comet pnpm install --frozen-lockfile
```

Dies sind Erstinstallationsschritte. Auf einer laufenden App weder Abhängigkeiten neu installieren noch `dist` direkt neu bauen; dafür Abschnitt 16 verwenden. Ein entpacktes Archiv ohne Git-Repository mit erreichbarer `origin` unterstützt den Git-Updater nicht.

---

## 7. .env-Datei konfigurieren

```bash
sudo tee /opt/comet/app/artifacts/api-server/.env >/dev/null << 'EOF'
NODE_ENV=production
PORT=3333
DATABASE_URL=postgresql://comet_app:SICHERES_PASSWORT_HIER@127.0.0.1:5432/comet_lkw
SESSION_SECRET=HIER_LANGEN_ZUFAELLIGEN_STRING_EINSETZEN
LOG_LEVEL=warn
COOKIE_SECURE=true
COMET_APP_DIR=/opt/comet/app
COMET_PM2_NAME=comet-api
COMET_PUBLIC_URL=https://IHRE_TATSAECHLICHE_DOMAIN/
EOF

sudo chmod 640 /opt/comet/app/artifacts/api-server/.env
sudo chown root:comet /opt/comet/app/artifacts/api-server/.env
```

Die Datei nur bei der Erstinstallation anlegen, niemals eine bestehende `.env` überschreiben. `COMET_PUBLIC_URL` auf die endgültige HTTPS-Adresse dieser Instanz setzen. `COOKIE_SECURE=true` setzt HTTPS voraus. Vorhandene Speicher-Einstellungen und Bilderpfade beibehalten; relative lokale Pfade beziehen sich im geprüften Betrieb auf `/opt/comet/app`. Die Datei als Dotenv-Daten laden, nicht mit `source` oder `export $(...)` als Shellcode.

### Sicheren SESSION_SECRET generieren

```bash
sudo -H -u comet node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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

Nur vor dem ersten Start einer neuen Instanz. Bei laufender Anwendung baut der Updater getrennt.

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

Nur vor dem ersten Start einer neuen Instanz.

```bash
cd /opt/comet/app
sudo -u comet pnpm --filter @workspace/api-server run build
```

---

## 11. PM2 als Prozessmanager einrichten

**Nur für eine neue Instanz.** Eine bereits funktionierende `pm2-comet.service` nicht überschreiben oder aus der root-NVM-Umgebung neu erzeugen. Der PM2-Manager unter `comet` ist ausschließlich für diese API vorgesehen; fremde Anwendungen verbleiben bei ihrem bisherigen Benutzer und Manager.

Falls auf einem vollständig neuen Server noch kein PM2 installiert ist: `sudo npm install -g pm2`. Auf einem gemeinsam genutzten Server zuerst vorhandenes PM2 prüfen, nicht global aktualisieren und kein `pm2 update` ausführen.

In derselben Shell die zugänglichen Binärpfade im Kontext des App-Benutzers ermitteln. Auf der geprüften Instanz sind dies `/usr/local/bin/node` und `/usr/local/bin/pm2`; neue Installationen können z. B. `/usr/bin/node` verwenden.

```bash
set -euo pipefail
NODE_BIN="$(sudo -H -u comet env PATH=/usr/local/bin:/usr/bin:/bin sh -c 'command -v node')"
PM2_BIN="$(sudo -H -u comet env PATH=/usr/local/bin:/usr/bin:/bin sh -c 'command -v pm2')"
sudo test -x "$NODE_BIN"
sudo test -x "$PM2_BIN"
printf 'Node: %s\nPM2: %s\n' "$NODE_BIN" "$PM2_BIN"

sudo -H -u comet tee /opt/comet/app/ecosystem.config.cjs >/dev/null <<EOF
module.exports = {
  apps: [
    {
      name: "comet-api",
      script: "/opt/comet/app/artifacts/api-server/dist/index.mjs",
      cwd: "/opt/comet/app",
      interpreter: "$NODE_BIN",
      node_args: [
        "--env-file=/opt/comet/app/artifacts/api-server/.env",
        "--enable-source-maps"
      ],
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
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

sudo -H -u comet "$NODE_BIN" --check /opt/comet/app/ecosystem.config.cjs
```

Eine explizite Systemd-Unit verwenden, die die API-Konfiguration startet – nicht einen möglicherweise veralteten PM2-Dump. Die Variablen `NODE_BIN` und `PM2_BIN` müssen aus dem obigen Schritt noch gesetzt sein. Nur bei einer neuen Instanz ohne bestehende Unit anlegen:

```bash
sudo tee /etc/systemd/system/pm2-comet.service >/dev/null <<EOF
[Unit]
Description=COMET API unter eigenem PM2-Manager
After=network.target postgresql.service

[Service]
Type=forking
User=comet
Group=comet
WorkingDirectory=/opt/comet/app
Environment=HOME=/opt/comet
Environment=PM2_HOME=/opt/comet/.pm2
Environment=PATH=/usr/local/bin:/usr/bin:/bin
PIDFile=/opt/comet/.pm2/pm2.pid
ExecStart=$PM2_BIN start /opt/comet/app/ecosystem.config.cjs --only comet-api
ExecReload=$PM2_BIN restart comet-api --update-env
ExecStop=$PM2_BIN stop comet-api
Restart=on-failure
RestartSec=5
KillMode=process

[Install]
WantedBy=multi-user.target
EOF

sudo systemd-analyze verify /etc/systemd/system/pm2-comet.service
sudo systemctl daemon-reload
sudo systemctl enable pm2-comet.service
sudo systemctl start pm2-comet.service
sudo systemctl status pm2-comet.service --no-pager
sudo -H -u comet env PM2_HOME=/opt/comet/.pm2 "$PM2_BIN" save
```

`enable` allein bestätigt keinen funktionierenden Autostart. In Abschnitt 18 Dienst, Listener und tatsächlichen API-Benutzer gemeinsam prüfen. Ein vollständiger Reboot auf einem gemeinsam genutzten Server muss separat abgestimmt werden.

---

## 12. Systemd-Service (Alternative zu PM2)

Der geprüfte Update-Ablauf benötigt PM2 und verwendet die Systemd-Unit **`pm2-comet.service` aus Abschnitt 11**. Keine zusätzliche `comet-api.service` parallel anlegen oder starten: Zwei API-Prozesse könnten denselben Port beanspruchen oder automatische Jobs doppelt ausführen.

Eine rein native Systemd-API ist ein anderes Betriebsmodell und nicht vom aktuellen Updater unterstützt. Eine vorhandene native Installation nur nach lesender Bestandsprüfung, gemeinsam gesicherter Datenbank/Bildablage und geplanter kurzer API-Unterbrechung umstellen. Interpreter, `.env`, API-Arbeitsverzeichnis und Bilderpfade beibehalten. Den bisherigen Startweg erst nach Prüfung des neuen deaktivieren; keine pauschalen Port-Kills oder Neustarts anderer PM2-Anwendungen verwenden.

---

## 13. Apache2 konfigurieren (inkl. WebSocket / Socket.IO)

### Schritt 1: Benötigte Module aktivieren

Nur die zusätzliche COMET-Site konfigurieren, bestehende VirtualHosts beibehalten. Änderungen erst nach erfolgreichem Konfigurationstest laden; kein Apache-Neustart für ein normales App-Update.

```bash
# Proxy-Module (HTTP + WebSocket)
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel   # <-- Pflicht für Socket.IO WebSocket!
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod expires

# Nur nach erfolgreichem Test laden
sudo apache2ctl configtest && sudo systemctl reload apache2

# Aktive Module prüfen
sudo apache2ctl -M | grep -E "proxy|rewrite|headers|expires"
```

### Schritt 2: VirtualHost-Konfiguration anlegen

```bash
sudo tee /etc/apache2/sites-available/comet.conf >/dev/null << 'EOF'
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

        # Nur gehashte Assets dürfen langfristig gecacht werden.
        <FilesMatch "\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$">
            ExpiresActive On
            ExpiresDefault "access plus 1 year"
            Header set Cache-Control "public, immutable"
        </FilesMatch>

        # Veränderliche PWA-Dateien und HTML müssen immer frisch geprüft werden.
        # Dieser Block muss NACH dem Asset-Cache-Block stehen (auch im HTTPS-VHost).
        <FilesMatch "^(index\.html|sw\.js|build-info\.json|manifest\.json)$">
            ExpiresActive Off
            Header always set Cache-Control "no-store, no-cache, must-revalidate"
            Header always set Pragma "no-cache"
            Header always set Expires "0"
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
    RewriteRule ^/api/socket\.io/(.*)$ ws://127.0.0.1:3333/api/socket.io/$1 [P,L]

    # Socket.IO HTTP-Polling (Fallback, wenn WebSocket nicht verfügbar)
    ProxyPass        /api/socket.io/ http://127.0.0.1:3333/api/socket.io/ nocanon
    ProxyPassReverse /api/socket.io/ http://127.0.0.1:3333/api/socket.io/

    # ── REST-API ────────────────────────────────────────────
    ProxyPass        /api/ http://127.0.0.1:3333/api/
    ProxyPassReverse /api/ http://127.0.0.1:3333/api/

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
sudo a2ensite comet.conf

# Konfiguration prüfen (darf kein Fehler kommen!)
sudo apache2ctl configtest

# Apache neu laden
sudo systemctl reload apache2
```

### Schritt 4: Dateiberechtigungen für Apache setzen

```bash
# Apache (www-data) braucht Lesezugriff auf die statischen Dateien
sudo chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public
```

---

## 14. Firewall (ufw) konfigurieren

Nur nach Prüfung der vorhandenen Firewall und aller anderen Dienste. Eine bestehende Firewall nicht zurücksetzen oder ungeprüft aktivieren. SSH-Port gegebenenfalls anpassen; zuerst Zugänge erlauben, dann auf einer neuen Instanz aktivieren.

```bash
# HTTP und HTTPS öffnen
sudo ufw allow http
sudo ufw allow https

# SSH sicherstellen (wichtig, sonst sperren Sie sich aus!)
sudo ufw allow ssh

# Nur auf einer neuen Instanz nach Prüfung der Regeln
sudo ufw enable

# Status prüfen
sudo ufw status verbose
```

> Port `3333` (Backend) wird **nicht** direkt geöffnet — nur Apache ist von außen erreichbar. Bei einer abweichenden Bestandskonfiguration müssen `.env`, Proxy-Ziel und Prüfadresse denselben Port verwenden.

---

## 15. SSL/TLS mit Let's Encrypt (empfohlen)

```bash
# Certbot und Apache-Plugin installieren
sudo apt install -y certbot python3-certbot-apache

# Zertifikat anfordern (IHRE_DOMAIN anpassen)
sudo certbot --apache -d comet.ihre-domain.de

# Automatische Erneuerung testen
sudo certbot renew --dry-run
```

Certbot ergänzt automatisch die Apache-Konfiguration mit `<VirtualHost *:443>` und HTTPS-Redirect.

**Nach SSL:** `X-Forwarded-Proto` in der HTTPS-VirtualHost auf `https` setzen:

```apache
RequestHeader set X-Forwarded-Proto "https"
```

---

## 16. Updates deployen (Workflow)

Der [geprüfte Updater](tools/operations/README.md) baut getrennt, sichert Datenbank und Bilder gemeinsam, prüft die Wiederherstellung in Isolation und übernimmt erst danach. Die Korrekturen müssen zuvor auf GitHub im konfigurierten Branch liegen (standardmäßig `main`). Lokale Änderungen an verfolgten Dateien und ein bereits laufendes Update verhindern den Start.

```bash
sudo -H -u comet bash /opt/comet/app/update.sh
```

Beim direkten SSH-Aufruf die Verbindung bis zum Abschluss offen lassen; nicht mit `Strg+C` abbrechen. Alternativ im **Systemstatus** starten: Der Browserstart läuft entkoppelt von Browser und API. Ein Verbindungsabbruch beim API-Neustart ist kein Ergebnis; Abschlussstatus prüfen.

Kein vorheriges `git pull`, kein manuelles `pnpm install` im laufenden App-Verzeichnis und keine Live-Builds. `--frozen-lockfile` beibehalten. Nur `comet-api` wird gezielt neu gestartet; die API kann kurz unterbrochen werden. Apache, PostgreSQL und andere PM2-Anwendungen werden nicht neu gestartet.

Für PostgreSQL-Sicherungsprüfungen müssen `pg_dump`, `pg_restore`, `initdb` und `postgres` in passender Hauptversion verfügbar sein. Für die vorhandene PostgreSQL-18-Instanz bei Bedarf `COMET_PG_BIN=/usr/lib/postgresql/18/bin` in der geschützten App-Konfiguration setzen, nicht den laufenden Cluster ändern.

Bei einem Fehler vor Übernahme bleiben die laufenden Builds bestehen. Nach Übernahme versucht das Skript, die vorherigen Builds zurückzutauschen. Es führt **keinen automatischen Datenbank-Restore** aus; Start-Migrationen der API sind nicht automatisch rückgängig gemacht. Wenn die automatische Rückkehr fehlschlägt, Dienst und Auslieferung prüfen statt einen weiteren Update-Auftrag auf Verdacht zu starten.

---

## 17. Troubleshooting

### Verbindung testen

```bash
# Läuft das Backend auf dem konfigurierten Port?
sudo ss -ltnp 'sport = :3333'

# Direkter API-Test (ohne Apache)
sudo curl --fail --silent --show-error http://127.0.0.1:3333/api/healthz

# Über Apache testen
sudo curl -s http://localhost/api/auth/me

# Socket.IO-Endpunkt testen (HTTP-Polling)
sudo curl -s "http://localhost/api/socket.io/?EIO=4&transport=polling"
# Erwartete Antwort: 0{"sid":"...","upgrades":["websocket"],...}
```

### Log-Dateien

```bash
# Backend (PM2)
sudo -H -u comet env PM2_HOME=/opt/comet/.pm2 pm2 logs comet-api --lines 50

# Autostart-Dienst
sudo journalctl -u pm2-comet.service -n 50 --no-pager

# Apache-Zugriffs-Log
sudo tail -f /var/log/apache2/comet-access.log

# Apache-Fehler-Log (wichtigste Quelle bei 502/503)
sudo tail -f /var/log/apache2/comet-error.log

# PostgreSQL
sudo journalctl -u postgresql -n 30 --no-pager
```

### Häufige Probleme

| Problem | Ursache | Lösung |
|---|---|---|
| `502 Bad Gateway` | Backend oder Proxy-Ziel nicht erreichbar | Erst Listener, Benutzer, Port und Backend-Logs lesend prüfen (Abschnitt 18), keine zweite API starten |
| `403 Forbidden` auf Frontend | Apache hat keinen Lesezugriff | `chmod -R o+rX /opt/comet/app/artifacts/comet-lkw/dist/public` |
| WebSocket fällt auf Polling zurück | `proxy_wstunnel` nicht aktiv | `a2enmod proxy_wstunnel && systemctl reload apache2` |
| Seite lädt, aber `/api` gibt 404 | `proxy` / `proxy_http` fehlt | `a2enmod proxy proxy_http && systemctl reload apache2` |
| SPA-Routing kaputt (404 bei direktem URL) | `RewriteEngine` nicht aktiv | `a2enmod rewrite` + Directory-Block prüfen |
| Frontend zeigt leere Seite | Falscher `BASE_PATH` oder Auslieferung | Release-Konfiguration und öffentliche Auslieferung prüfen; korrigierten Git-Stand über Abschnitt 16 bauen, nicht live |
| Session geht verloren | `SESSION_SECRET` fehlt | `.env` prüfen, Backend neu starten |
| `AH00526: Syntax error` | Tippfehler in conf-Datei | `apache2ctl configtest` zeigt genaue Zeile |

### WebSocket-Verbindung debuggen

```bash
# WebSocket-Upgrade-Header prüfen
sudo curl -s -I \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  "http://localhost/api/socket.io/?EIO=4&transport=websocket"

# Aktive Proxy-Module auflisten
sudo apache2ctl -M | grep proxy
```

---

## 18. Bestehende Installation lesend prüfen

Normale Updates ausschließlich wie in Abschnitt 16 ausführen. Die folgenden Prüfungen lesen nur den bestehenden Zustand und ersetzen keine Installation oder Reparatur:

```bash
sudo getent passwd comet
sudo systemctl is-enabled pm2-comet.service
sudo systemctl is-active pm2-comet.service
sudo systemctl show pm2-comet.service \
  -p User -p Group -p PIDFile -p MainPID -p WorkingDirectory -p ExecStart
sudo cat /opt/comet/.pm2/pm2.pid

# Tatsächlichen Listener und dessen PID prüfen, nicht nur PM2-Anzeigen:
sudo ss -ltnp 'sport = :3333'
sudo curl --fail --silent --show-error http://127.0.0.1:3333/api/healthz
```

Die API-PID aus `ss` einsetzen, nicht den PM2-Daemon-PID:

```bash
sudo ps -o pid,ppid,user,group,comm -p API_PID_HIER_EINSETZEN
sudo readlink /proc/API_PID_HIER_EINSETZEN/cwd
```

Erwartet: API-Benutzer `comet`, CWD `/opt/comet/app`, aktiver und aktivierter `pm2-comet.service`, PID-Datei `/opt/comet/.pm2/pm2.pid` und erfolgreiche interne API-Prüfung. Anschließend die tatsächliche öffentliche HTTPS-Adresse und Anmeldung/Bilder prüfen. Ein HTTP-200 allein bestätigt nicht, dass der richtige VirtualHost die neue App ausliefert.

Den zuvor gespeicherten PM2-Stand nur über ausgewählte Felder prüfen, ohne Umgebungswerte auszugeben oder einen neuen PM2-Daemon zu starten:

```bash
sudo -H -u comet node -e '
const fs = require("node:fs");
const saved = JSON.parse(fs.readFileSync("/opt/comet/.pm2/dump.pm2", "utf8"));
console.log(saved.map(p => ({
  name: p.name,
  script: p.pm_exec_path,
  cwd: p.pm_cwd,
  interpreter: p.exec_interpreter
})));
'
```

Erwartet: nur die vorgesehenen COMET-Prozesse, keine root-NVM-Interpreter, API-CWD `/opt/comet/app`. Der gespeicherte Stand ist kein Nachweis der aktuellen API-UID. Die beschriebene Unit startet die explizite Konfiguration, statt diesen Dump automatisch wiederherzustellen.

**Bei Abweichungen:** Keine zweite API starten, solange der Listener nicht zugeordnet ist. Ein erfolgreicher `pm2 describe` unter `comet` beweist nicht den Linux-Benutzer des API-Prozesses. Kein `pm2 kill`, `pm2 update`, Port-Kill oder pauschales Umbenennen/Löschen fremder Prozesse. Bestehende Root-PM2-Anwendungen unangetastet lassen.

**Rückkehr und Sicherung:** Im Systemstatus den gespeicherten Abschluss sowie den Rückkehrstatus prüfen. Eine positive Sicherung braucht den gemeinsamen Datenbank-/Bildnachweis und eine erfolgreiche isolierte Wiederherstellungsprobe, nicht nur eine große SQL-Datei. Eine Datenbank-Rückspielung würde zwischenzeitliche Geschäftsdaten überschreiben und ist ein separat zu planender Eingriff mit ausdrücklicher Freigabe, keine allgemeine Update-Reparatur.

---

## Schnellreferenz: Wichtige Pfade & Befehle

| Ressource | Pfad / Befehl |
|---|---|
| Projektverzeichnis | `/opt/comet/app/` |
| Backend-Bundle | `/opt/comet/app/artifacts/api-server/dist/index.mjs` |
| Backend `.env` | `/opt/comet/app/artifacts/api-server/.env` |
| API-CWD | `/opt/comet/app` |
| API-Benutzer / Home | `comet` / `/opt/comet` |
| PM2_HOME / PIDFile | `/opt/comet/.pm2` / `/opt/comet/.pm2/pm2.pid` |
| Autostart-Dienst | `pm2-comet.service` |
| Sicheres Update | `sudo -H -u comet bash /opt/comet/app/update.sh` |
| Frontend-Build | `/opt/comet/app/artifacts/comet-lkw/dist/public/` |
| Apache-Konfiguration | `/etc/apache2/sites-available/comet.conf` |
| Apache-Module aktivieren | `a2enmod proxy proxy_http proxy_wstunnel rewrite headers` |
| Konfiguration testen | `apache2ctl configtest` |
| Apache neu laden | `systemctl reload apache2` |
| Backend-Logs (PM2) | `sudo -H -u comet env PM2_HOME=/opt/comet/.pm2 pm2 logs comet-api` |
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
