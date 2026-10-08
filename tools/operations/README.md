# COMET: sichere Updates und gemeinsame Sicherungen

Diese Werkzeuge laufen als **comet**, niemals als root. Sie aktualisieren ausschließlich die angesprochene Instanz. Es gibt keine Fernsteuerung anderer Server und keine Abschaltung des alten Debian-Servers.

## Voraussetzungen auf einer selbstgehosteten Instanz

- Node.js **22 oder neuer**, pnpm, Git, Python 3, `flock`, curl und PM2.
- PostgreSQL-Client und Serverwerkzeuge: `pg_dump`, `pg_restore`, `initdb`, `postgres`. Die lokale PostgreSQL-Hauptversion muss zum verwendeten `pg_dump` passen. Bei abweichender Installation `COMET_PG_BIN` setzen, z. B. `/usr/lib/postgresql/16/bin`. `pg_config` ist nicht zwingend nötig.
- Der bestehende PM2-Prozess heißt standardmäßig `comet-api`; ein anderer Name wird über `COMET_PM2_NAME` eingestellt. Kein neuer Dienst wird automatisch angelegt.
- Das Git-Repository hat eine erreichbare `origin`; standardmäßig wird `main` gelesen. `COMET_UPDATE_BRANCH` erlaubt eine andere Branch. Lokale Änderungen an verfolgten Dateien verhindern das Update.
- pnpm **10.26 oder neuer**: Die Freigabe benötigter Installationsskripte steht als `allowBuilds` in `pnpm-workspace.yaml`. pnpm 11 unterstützt das frühere `onlyBuiltDependencies` nicht mehr.
- Der konfigurierte Bilderpfad und alle Datenbanktabellen müssen lesbar sein. Die Speicher-Einstellungen der Datenbank haben Vorrang vor `STORAGE_BACKEND` / `LOCAL_STORAGE_DIR`, wie in der App.
- API und Backup-CLI verwenden dieselbe reale Speicherbasis. Bei relativen lokalen Pfaden `COMET_STORAGE_CWD` auf das ursprüngliche Arbeitsverzeichnis der API setzen.

Einmalig die zusätzlichen Verzeichnisse vorbereiten, ohne das gesamte App-Verzeichnis umzueignen:

```bash
sudo install -d -o comet -g comet -m 755 /opt/comet/releases
sudo install -d -o comet -g comet -m 700 /opt/comet/backups /opt/comet/app/.comet-operations
```

In der vorhandenen `artifacts/api-server/.env` folgende **nicht geheimen** Betriebseinstellungen ergänzen. Zugangsdaten bleiben in der vorhandenen geschützten Konfiguration.

```dotenv
COMET_APP_DIR=/opt/comet/app
COMET_PUBLIC_URL=https://DEINE-TATSAECHLICHE-DOMAIN/
COMET_PM2_NAME=comet-api
```

`COMET_PUBLIC_URL` muss die endgültige URL dieser Instanz sein, einschließlich eines gegebenenfalls notwendigen Basispfads. Nicht die URL des anderen Servers verwenden. Standardmäßig wird die interne API unter `http://127.0.0.1:$PORT/api/healthz` geprüft; `COMET_HEALTH_URL` überschreibt das bei Bedarf.

Die `.env` wird als Dotenv-Daten gelesen, nicht als ausführbarer Shellcode. Geänderte Werte werden beim PM2-Neustart mit `--update-env` übernommen. Damit die API selbst den Browserstart freigibt, muss sie die oben ergänzten Einstellungen ebenfalls geladen haben.

**Apache/RHEL:** Symlinks müssen im bestehenden DocumentRoot erlaubt sein. SELinux muss die Frontend-Dateien unter dem Release-Verzeichnis lesen dürfen. Entsprechende Dateikontexte gehören zur bestehenden Serverkonfiguration; das Skript deaktiviert SELinux nicht und startet Apache nicht neu. Ohne passende Konfiguration scheitert die öffentliche Prüfung und die vorherigen Builds werden zurückgenommen.

## Update-Ablauf

Unter **Einstellungen → Sidebar** ist „Systemstatus“ mit Beschriftung, Symbol, Reihenfolge und Rollensichtbarkeit konfigurierbar. Sichtbarkeit ist kein Zugriffsrecht: Unter **Berechtigungen → System** werden `system.view` (Status, Fortschritt und Sicherungsnachweise) und `system.update` (Updates starten) getrennt vergeben. Ein Update benötigt beide Rechte. Bestehende Nicht-Admin-Rollen erhalten die neuen Rechte standardmäßig nicht; auch eigene Rollen können sie erhalten.

Personen mit delegierten System-Rechten verwenden **Systemstatus** in der Seitenleiste. Dort sind auch Fortschritt und Sicherungsnachweise verfügbar, ohne Zugriff auf die übrigen globalen Einstellungen zu erhalten.

Über **Einstellungen → System → Server sicher aktualisieren** oder direkt:

```bash
sudo -u comet bash /opt/comet/app/update.sh
```

1. Voraussetzungen und einen exklusiven Update-Lock prüfen.
2. Gewünschten Git-Stand in einem neuen Release-Verzeichnis auspacken.
3. Abhängigkeiten, Backend und Frontend ausschließlich dort bauen.
4. App-Root, gebaute JS-/CSS-Dateien und Backend-Syntax prüfen. Alte gehashte Assets bleiben für bereits geöffnete Browser erhalten.
5. PostgreSQL und Bilder gemeinsam sichern; die Sicherung separat wiederherstellen und prüfen.
6. Den Backend-Build mit Linux `renameat2(RENAME_EXCHANGE)` atomar austauschen, nur `comet-api` gezielt neu starten und die interne API prüfen.
7. Frontend-Verzeichnis ebenfalls atomar tauschen. Öffentliche HTML-Auslieferung muss der neuen `index.html` entsprechen; lokale JS/CSS werden per HTTP einschließlich Inhaltstyp geprüft.
8. Den geprüften Git-Quellstand übernehmen und den PM2-Zustand speichern.

Bei Fehlern vor der Übernahme bleiben die laufenden Builds unverändert. Bei späteren Fehlern werden die vorherigen Builds zurückgetauscht und der eigene API-Dienst erneut gestartet. Ein erfolgloser Rückkehrversuch wird **nicht** als Erfolg angezeigt. Es gibt kein `fuser -k`, keinen pauschalen Port-Kill, kein PM2-Delete und keine Datenbank-Rückspielung.

Der API-Neustart kann kurzzeitig Verbindungen unterbrechen. Es wird **kein vollständiges Zero-Downtime-Update** versprochen. Insbesondere gibt es keine automatische Rücknahme von Datenbankschema-Änderungen, die die App selbst beim Start ausführt; inkompatible Migrationen müssen vorab geplant werden.

Der Browser startet einen ausdrücklich bestätigten **POST** mit Herkunftsprüfung. Der alte GET-/SSE-Start liefert 410 und löst nichts mehr aus. Ein unabhängiger Hintergrundauftrag hält den Lock auch beim API-Neustart. Fortschritt und Ergebnis werden privat gespeichert; ein verlorener Browserkontakt heißt „unbekannt“, nicht „erfolgreich“ oder automatisch „fehlgeschlagen“. Rohprotokolle bleiben auf dem Server.

## Sicherung unabhängig von einem Update

```bash
sudo -u comet bash -c 'cd /opt/comet/app && node --env-file=artifacts/api-server/.env tools/operations/backup.mjs'
sudo -u comet bash -c 'cd /opt/comet/app && node --env-file=artifacts/api-server/.env tools/operations/verify-backup.mjs /opt/comet/backups/DEINE-SICHERUNG'
```

Der erste Aufruf erzeugt ein neues, nicht überschreibbares Verzeichnis. Optional den Zielpfad als Argument übergeben oder `COMET_BACKUP_DIR` konfigurieren. Der zweite Aufruf akzeptiert **ausschließlich eigene vertrauenswürdige Sicherungen**; ein PostgreSQL-Archiv kann SQL-Code enthalten.

- PostgreSQL wird in einem exportierten, lesenden Snapshot mit `pg_dump --format=custom` gesichert.
- Die lokale Bilderablage wird vollständig kopiert und gehasht; geänderte Dateien, Symlinks oder unlesbare Inhalte verhindern eine abgeschlossene Sicherung.
- Cloud-Speicher wird vollständig paginiert über private und konfigurierte öffentliche Präfixe gesichert. Die jeweilige Dateigeneration, Inhaltsmetadaten und ACL-Metadaten bleiben dokumentiert; Generationen werden beim Herunterladen festgehalten.
- Es gibt keine globale Transaktion über PostgreSQL und Dateispeicher. Externe Dateilöschungen/Umzüge sind während einer Sicherung zu vermeiden. Der Snapshot plus unveränderte Dateien beziehungsweise feste Cloud-Generationen ist keine Zusicherung für beliebige parallele Eingriffe durch andere Werkzeuge.
- Erst `manifest.json` kennzeichnet eine vollständige Sicherung. Ein abgebrochener Versuch bleibt privat und unvollständig erhalten, ohne positiven Nachweis.
- Die Wiederherstellungsprobe erstellt eine eigene PostgreSQL-Instanz mit privatem Unix-Socket, **ohne TCP-Listener**. Sie verbindet sich niemals mit der laufenden `DATABASE_URL`.
- Alle gesicherten Tabellen und Zeilenzahlen werden mit der wiederhergestellten Datenbank verglichen; Bilddateien werden separat zurückkopiert und anhand ihrer SHA-256-Prüfsummen geprüft.
- Die Probe überschreibt weder Produktionsdatenbank noch produktive Bilder. Cloud-Uploads, App-Anmeldung, Fremddienste und sämtliche Fachfunktionen sind damit noch nicht geprüft.
- Eine erneute fehlgeschlagene Prüfung entfernt den positiven Nachweis dieser Sicherung. Ein beschädigtes Archiv oder Bild ist kein grünes Ergebnis.

Sicherungen enthalten geschäftliche Daten und möglicherweise sensible Datenbankinhalte. Verzeichnisse sind privat, Dateien werden nicht über die App ausgeliefert und gehören nicht ins Git-Repository. Die Dateien sind **nicht automatisch verschlüsselt**. Eine separate geschützte Kopie auf einem anderen System sowie regelmäßige Sicherungen außerhalb von Updates müssen zusätzlich eingerichtet werden. Es gibt absichtlich keine automatische Löschung oder Aufbewahrungsverkürzung.

## Abbruch bei der Installation: ERR_PNPM_IGNORED_BUILDS

Wird beispielsweise `esbuild@0.27.3` als blockiertes Installationsskript gemeldet, die im ausgepackten Git-Stand enthaltene `allowBuilds`-Freigabe prüfen. Die benötigten Pakete werden einzeln freigegeben; keine pauschale Skriptfreigabe verwenden.

Die korrigierte Projektdatei zuerst committen und auf den konfigurierten Git-Branch pushen. Danach den fehlgeschlagenen Auftrag im Systemstatus prüfen und ein neues Update starten. Der nächste Auftrag liest die korrigierte Datei aus dem neuen Git-Stand. Weder `pnpm approve-builds` noch `pnpm install` im laufenden App-Verzeichnis ausführen; `--frozen-lockfile` beibehalten.

Dieser Abbruch liegt vor Build und Übernahme. Das vollständige private Protokoll liegt in `.comet-operations/update.log`; es gehört nicht ins Git-Repository oder ungeprüft in öffentliche Fehlerberichte.

## Nachgewiesene Tests

```bash
node --test tools/operations/operations.test.mjs
```

Die Tests führen Updates nur in temporären Verzeichnissen mit kontrollierten Git-/PM2-/Build-/HTTP-Ersatzprozessen aus. Sie prüfen Fehler vor und nach der Übernahme, die Rückkehr zu beiden vorherigen Builds, den Erfolgspfad und den Erhalt alter Browser-Assets. Eine zusätzliche echte PostgreSQL-/Dateisicherungsprobe arbeitet ausschließlich mit einer selbst erzeugten temporären Datenbank und Bilddatei.
