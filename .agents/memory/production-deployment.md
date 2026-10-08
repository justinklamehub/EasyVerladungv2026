---
name: Production deployment gotchas
description: Self-hosted deployment issues specific to COMET LKW on Debian/Apache2
---

## PM2-Client ist kein Nachweis des API-Benutzers

Ein erfolgreicher `sudo -u comet pm2 describe comet-api` beweist nicht, dass der tatsächliche API-Prozess als `comet` läuft. Vor einer Benutzerumstellung den Linux-Benutzer des API-PIDs, seinen Elternprozess und den zugehörigen Listener prüfen.

**Why:** Auf Debian wurde der PM2-Prozess unter dem comet-Client gefunden, während die laufende API anschließend UID 0 meldete. Eine ungezielte zweite PM2-Instanz oder ein pauschaler Neustart könnte andere Dienste betreffen.

**How to apply:** Erst Prozesszuordnung lesend ermitteln. Keine Sicherheitsprüfung deaktivieren, kein `pm2 kill`, kein Port-Kill und keine zweite API auf Verdacht starten.

PM2 `jlist` kann bei einer abweichenden CLI-/Daemon-Version einen Versionshinweis vor die JSON-Ausgabe auf stdout schreiben.

**Why:** Die root-PM2-Diagnose scheiterte an diesem Hinweis, obwohl der API-Listener weiterlief.

**How to apply:** In lesenden Diagnose-Pipelines den JSON-Array-Teil isolieren und nur ausgewählte Prozessfelder ausgeben. Nicht `pm2 update` als Parser-Reparatur verwenden: Ein Daemon-Update kann auch andere verwaltete Anwendungen neu starten.

Bei einer Benutzer- oder PM2-Umstellung auf dem alten Debian-Server das bestehende API-Arbeitsverzeichnis `/opt/comet/app` beibehalten, bis relative Speicherpfade ausdrücklich geklärt sind.

**Why:** Die tatsächliche laufende Debian-API verwendet den App-Root als CWD, nicht den API-Unterordner aus dem Installationsbeispiel. Eine Änderung könnte eine andere lokale Bilderablage auswählen.

**How to apply:** Scriptpfad und CWD getrennt übertragen; gegebenenfalls `COMET_STORAGE_CWD` auf das ursprüngliche API-Arbeitsverzeichnis setzen. Keinen Bilderpfad neu erfinden.

## Produktionsumgebung und Einlagerungsübernahme

Der Nutzer hat bestätigt: Das produktive COMET-System läuft „auf meinem eigenen Server außerhalb von Replit“.

**Why:** Der Nutzer hat die eigene Serverumgebung ausdrücklich bestätigt; Hinweise für Replits verwaltete Produktionsdatenbank sind dafür nicht der passende Übertragungsweg.

**How to apply:** Serverkonfiguration und vorhandene Produktionsdaten beibehalten. Für Einlagerungsübernahmen nur diesen Bereich übertragen, fremde Speditions-IDs nicht ungeprüft übernehmen und eine Sicherung vor dem Austausch verlangen. Eine bereitgestellte Datei bedeutet nicht, dass auf dem Produktivserver bereits importiert wurde.

Für Einlagerungsübernahmen verlangt der Nutzer die Daten als PostgreSQL-SQL für „SQL Kommando“ in Adminer, nicht nur ein Node-Werkzeug oder eine ZIP-Datei.

**Why:** Der Nutzer hat die Bitte um direkt verwendbare SQL-Daten mehrfach wiederholt und Adminer für PostgreSQL ausdrücklich genannt.

**How to apply:** Eine direkt herunterladbare SQL-Datendatei bereitstellen. SQL-Dialekt PostgreSQL verwenden; phpMyAdmin nicht als PostgreSQL-Verwaltung darstellen.

## Bestehender PostgreSQL-Cluster auf Debian

Der alte Debian-Server verwendet PostgreSQL 18 mit dem bestehenden Cluster `main` auf Port 5432. Für Wiederherstellungsproben die zur tatsächlichen pg_dump-Version passenden Serverwerkzeuge verwenden, nicht ungeprüft die PostgreSQL-16-Beispiele aus der Entwicklungsumgebung.

**Why:** Der Nutzer bestätigte am 2026-10-08 PostgreSQL 18 als laufenden Cluster und pg_dump 18. Die Entwicklungsumgebung verwendet eine andere Hauptversion.

**How to apply:** Vor späteren Arbeiten die aktuelle Version erneut prüfen. Den vorhandenen Cluster nicht neu initialisieren, ersetzen oder für eine Probe stoppen.

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

Der Nutzer verlangt: „Ich muss den alten Server auch weiterhin laufen lassen!!!“

**Why:** Der laufende Debian-Server wird weiterhin benötigt; der neue RHEL-Server ersetzt ihn nicht automatisch.

**How to apply:** Den alten Server und seine Anwendung nicht im Rahmen der Migration abschalten. Fehler auf Debian getrennt vom RHEL-Ziel diagnostizieren; vor Eingriffen die Auswirkungen auf den laufenden Betrieb erklären.

Frontend-Builds auf dem laufenden selbst gehosteten Server in einem separaten Ausgabeordner erstellen und erst nach erfolgreicher Prüfung übernehmen.

**Why:** Apache benötigt die gebaute Einstiegsdatei fortlaufend. Ein fehlgeschlagener Build darf nicht zuvor die aktive Ausgabe leeren und dadurch den weiterhin benötigten alten Server unbenutzbar machen.

**How to apply:** Bestehende Assets erhalten, neue Assets zuerst übertragen und die fertige Einstiegsdatei zuletzt atomar ersetzen. Weder Anwendung noch Webserver für eine reine Aktualisierung statischer Frontend-Dateien stoppen.

Der Nutzer möchte die selbst gehostete Verladungsanwendung von Debian 12 auf RHEL 9.7 übertragen. Auf dem Zielserver laufen bereits zwei andere Websites; sie müssen unverändert weiterlaufen.

Die vom Nutzer gelieferte Bestandsprüfung bestätigt Nginx als aktiven Webserver und eine bestehende MariaDB. PostgreSQL für die Verladungsanwendung zusätzlich und getrennt einrichten, MariaDB nicht ersetzen.

Die Quell-Datenbank auf Debian verwendet PostgreSQL 18.4. Für die Migration PostgreSQL 18 auf RHEL vorsehen; nicht ungeprüft ein älteres Zielsystem nehmen.

Das Ziel-RHEL bietet PostgreSQL 18 bereits über seine freigegebene AppStream/RHUI-Paketquelle an; die externe PostgreSQL-Repository-Adresse ist wie die npm-Registry per TLS nicht erreichbar.

**Why:** Ein externer Repository-Download oder Offline-RPM-Transfer ist für PostgreSQL hier unnötig und würde an der Netzbeschränkung scheitern.

**How to apply:** PostgreSQL 18 aus dem vorhandenen RHEL-Modul installieren, ohne an der bestehenden MariaDB oder den beiden anderen Websites zu arbeiten.

Beim selbst gehosteten Umzug den absoluten lokalen Bilderpfad aus der Quell-Datenbank zunächst auf dem neuen Server beibehalten, statt die gespeicherte Pfadeinstellung für den Testimport umzuschreiben.

**Why:** Ein frischer Datenbankimport zum endgültigen Umschalten würde eine vorab geänderte Zieleinstellung wieder durch den Quellpfad ersetzen; bestehende Bildreferenzen sollen erhalten bleiben.

**How to apply:** Bilder an denselben absoluten Pfad übertragen, getrennt vom Anwendungscode und geschützt vor allgemeinem Dateizugriff. Vor dem Start die Lesbarkeit für den eigenen App-Dienst prüfen; kurz vor Umschaltung letzte Dateisynchronisation durchführen.

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

Während der parallelen Migration darf der neue Testserver keine automatischen Jobs oder Benachrichtigungen ausführen; sein Backend soll nur auf localhost erreichbar sein.

**Why:** Eine kopierte Datenbank enthält weiterhin aktive Berichts- und Erinnerungseinstellungen. Ein zweiter normaler Serverstart könnte echte Empfänger doppelt benachrichtigen; öffentliche Scanner-Schreibzugriffe sollen nicht über einen ungeschützten Backend-Port möglich sein.

**How to apply:** Automatische Jobs auf dem Testserver vor dessen erstem Start deaktivieren und das Backend an localhost binden. Beim endgültigen Umschalten Jobs erst nach Stilllegung der alten Instanz aktivieren.

Der Ziel-Nginx bindet die beiden bestehenden Website-Konfigurationen einzeln ein, nicht über ein allgemeines `conf.d/*.conf`-Muster. SELinux ist auf dem Zielserver deaktiviert.

**Why:** Eine zusätzliche Konfigurationsdatei allein würde nicht geladen; unnötige globale Änderungen könnten die bestehenden Websites beeinträchtigen.

**How to apply:** Für die Verladungsdomain genau eine zusätzliche Include-Zeile im passenden Nginx-Kontext ergänzen, bestehende Includes erhalten und vor Reload prüfen. SELinux nicht im Zuge dieser Migration umstellen.

Für den RHEL-Betrieb hat der Nutzer ausdrücklich die neue Domain `easy-verladung.de` mit Bindestrich gewählt und `www.easy-verladung.de` als geplanten Zertifikatsnamen genannt; die bisherige Domain lautet `easyverladung.de`.

**Why:** Der Nutzer bestätigte die neue Domain nach Prüfung des bisherigen Zertifikats.

**How to apply:** Endgültige Domain- und HTTPS-Konfiguration auf die neue Domain ausrichten; für `www` und die Apex-Domain jeweils nur dann Zugriff einrichten, wenn DNS und Zertifikat den jeweiligen Namen tatsächlich abdecken. Das bisherige Zertifikat ohne Bindestrich deckt die neue Domain nicht ab und darf nicht als passendes Zertifikat wiederverwendet werden.

Beim vorläufigen Zugriff über die Server-IP können HTTP und HTTPS unterschiedliche Apps zeigen: Der namensbasierte HTTP-Testzugang zur Verladung funktioniert, während HTTPS über dieselbe IP weiterhin die bestehende RETOURE-Seite liefert.

**Why:** Ein zuvor ausgegebener permanenter HTTP-Redirect auf HTTPS kann im Browser weiterwirken, obwohl der direkte HTTP-Abruf längst die richtige Anwendung liefert. Ein erfolgreicher HTTP-Status allein zeigte die Verwechslung nicht.

**How to apply:** Bei scheinbar falscher App zuerst Schema und vollständige Adresszeile prüfen und mit einem direkten HTTP-Abruf inklusive HTML-Titel vergleichen; bestehende HTTPS-Sites nicht auf Verdacht umkonfigurieren.
