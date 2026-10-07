---
name: Production deployment gotchas
description: Self-hosted deployment issues specific to COMET LKW on Debian/Apache2
---

## Produktionsumgebung und Einlagerungsübernahme

Der Nutzer hat bestätigt: Das produktive COMET-System läuft „auf meinem eigenen Server außerhalb von Replit“.

**Why:** Der Nutzer hat die eigene Serverumgebung ausdrücklich bestätigt; Hinweise für Replits verwaltete Produktionsdatenbank sind dafür nicht der passende Übertragungsweg.

**How to apply:** Serverkonfiguration und vorhandene Produktionsdaten beibehalten. Für Einlagerungsübernahmen nur diesen Bereich übertragen, fremde Speditions-IDs nicht ungeprüft übernehmen und eine Sicherung vor dem Austausch verlangen. Eine bereitgestellte Datei bedeutet nicht, dass auf dem Produktivserver bereits importiert wurde.

Für Einlagerungsübernahmen verlangt der Nutzer die Daten als PostgreSQL-SQL für „SQL Kommando“ in Adminer, nicht nur ein Node-Werkzeug oder eine ZIP-Datei.

**Why:** Der Nutzer hat die Bitte um direkt verwendbare SQL-Daten mehrfach wiederholt und Adminer für PostgreSQL ausdrücklich genannt.

**How to apply:** Eine direkt herunterladbare SQL-Datendatei bereitstellen. SQL-Dialekt PostgreSQL verwenden; phpMyAdmin nicht als PostgreSQL-Verwaltung darstellen.

## Missing tables not in Drizzle schema

`roles` and `role_permissions` are raw SQL tables — `drizzle-kit push` does NOT create them.
Must be created manually before the API starts (otherwise `seedMissingPermissions()` crashes on boot):

```sql
CREATE TABLE IF NOT EXISTS roles (
  role_key TEXT PRIMARY KEY, label TEXT NOT NULL,
  role_group TEXT NOT NULL DEFAULT '', is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO roles (role_key, label, role_group, is_system) VALUES
  ('comet_leitstand','COMET Leitstand','COMET',true),
  ('comet_lager','COMET Lager','COMET',true),
  ('comet_viewer','COMET Viewer','COMET',true),
  ('speditions_admin','Spedition Admin','Spedition',true),
  ('speditions_bearbeiter','Spedition Bearbeiter','Spedition',true),
  ('speditions_viewer','Spedition Viewer','Spedition',true)
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL, permission TEXT NOT NULL, allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (role, permission)
);
```

## COOKIE_SECURE must be true for HTTPS

Set `COOKIE_SECURE=true` in `.env` when running behind HTTPS reverse proxy.
Without it, session cookies won't be sent back by the browser on HTTPS-only.
Apache must also set `RequestHeader set X-Forwarded-Proto "https"` (requires `a2enmod headers`).

## PM2 does not reload .env on restart

`pm2 restart` keeps old env vars cached. Must use `pm2 restart --update-env` or
`pm2 delete` + `export $(grep -v '^#' .env | xargs)` + `pm2 start ...` to pick up changes.

## IP vs Domain access

Direct IP access is HTTP-only (no SSL cert for IP). With `COOKIE_SECURE=true` cookies don't work over HTTP.
Fix: redirect all IP traffic to HTTPS domain in Apache `000-default.conf`:
```apache
<VirtualHost *:80>
  RewriteEngine On
  RewriteRule ^ https://www.easyverladung.de%{REQUEST_URI} [R=301,L]
</VirtualHost>
```

**Why:** Mixing HTTP (IP) and HTTPS (domain) breaks Secure-flagged session cookies.
**How to apply:** Always configure IP→domain redirect when COOKIE_SECURE is enabled.

## Migration auf einen gemeinsam genutzten RHEL-Server

Der Nutzer möchte die selbst gehostete Verladungsanwendung von Debian 12 auf RHEL 9.7 übertragen. Auf dem Zielserver laufen bereits zwei andere Websites; sie müssen unverändert weiterlaufen.

Die vom Nutzer gelieferte Bestandsprüfung bestätigt Nginx als aktiven Webserver und eine bestehende MariaDB. PostgreSQL für die Verladungsanwendung zusätzlich und getrennt einrichten, MariaDB nicht ersetzen.

Die Quell-Datenbank auf Debian verwendet PostgreSQL 18.4. Für die Migration PostgreSQL 18 auf RHEL vorsehen; nicht ungeprüft ein älteres Zielsystem nehmen.

Das Ziel-RHEL bietet PostgreSQL 18 bereits über seine freigegebene AppStream/RHUI-Paketquelle an; die externe PostgreSQL-Repository-Adresse ist wie die npm-Registry per TLS nicht erreichbar.

**Why:** Ein externer Repository-Download oder Offline-RPM-Transfer ist für PostgreSQL hier unnötig und würde an der Netzbeschränkung scheitern.

**How to apply:** PostgreSQL 18 aus dem vorhandenen RHEL-Modul installieren, ohne an der bestehenden MariaDB oder den beiden anderen Websites zu arbeiten.

**Why:** Der Nutzer hat den gemeinsamen Betrieb ausdrücklich als Randbedingung der Migration genannt.

**How to apply:** Erst vorhandenen Webserver, Dienste und Portbelegung prüfen. Einen eigenen namensbasierten VirtualHost/server-Block und separaten App-Dienst ergänzen; keine globale IP-Weiterleitung aus der obigen Einzelserver-Anleitung übernehmen. Vorhandene Datenbanken nicht neu initialisieren. Datenbank und lokalen Dateispeicher gemeinsam migrieren, vor DNS-Wechsel testen. Die vorhandene RHEL-Anleitung bezieht sich auf RHEL 7.9 und darf nicht ungeprüft für RHEL 9.7 verwendet werden.

Auf dem RHEL-Zielserver ist `/home` ein separates Dateisystem mit nur etwa 1 GB Kapazität. Große Offline-Paketspeicher und Build-Dateien nicht im Home-Verzeichnis vorbereiten.

**Why:** Der Offline-Paketimport erschöpfte den Platz in `/home`, obwohl andere Dateisysteme noch frei waren.

**How to apply:** Vor dem Transfer Platz und Inodes des tatsächlichen Zieldateisystems prüfen. Paketspeicher, Caches und Projektverzeichnis auf einem ausreichend großen Dateisystem planen; freien Platz für die bestehenden Websites und Datenbanken berücksichtigen.

Für die Servermigration gilt die Nutzervorgabe: „Es muss alles über sudo laufen.“

**Why:** Der Nutzer verlangt dies ausdrücklich für die Arbeit auf dem Zielserver.

**How to apply:** Weitere Serverbefehle mit `sudo` angeben; bei Befehlsblöcken auch Umleitungen und Shell-Operationen unter einer passenden sudo-Shell ausführen. Der dauerhafte App-Dienst benötigt deswegen keine Root-Rechte; bei Bedarf `sudo -u` für dessen Dienstbenutzer verwenden.

Eine erfolgreiche globale npm-Installation bedeutet auf dem Zielserver nicht, dass deren Befehle im Suchpfad der sudo-Shell liegen.

**Why:** pnpm war installiert und direkt ausführbar, wurde aber unter seinem Befehlsnamen von der sudo-Shell nicht gefunden.

**How to apply:** Den Installationsort ermitteln und direkte Aufrufe verwenden, statt Pakete erneut zu installieren oder die globale sudo-Konfiguration zu ändern.
