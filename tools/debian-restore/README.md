# COMET / Easy-Verladung: Wiederherstellung auf einem NEUEN Debian-Server

Dieses Paket installiert deinen gesicherten App-Stand mit Datenbank und Bildern.
Es steuert keinen anderen Server, ändert kein DNS und schaltet den alten Server
nicht ab. **Nicht auf dem bisherigen Produktivserver ausführen.**

## Voraussetzungen und Grenzen

- Neuer, dedizierter **Debian-12-Server, amd64**, mit sudo und systemd.
- Ausreichend freier Speicher und Inodes unter `/opt`, `/var` und im Backup-Verzeichnis:
  Platz für Archive, entpackten Paketspeicher, node_modules, Builds, Datenbank und Bilder.
- Internetzugang für Debian-Pakete, PostgreSQL 18 und Node.js 24. Die **App-Pakete**
  werden dagegen aus deinem Offline-Archiv installiert. Das Archiv ist kein kompletter
  Offline-Installer für das Betriebssystem.
- Nur eigene, vertrauenswürdige Sicherungen verwenden. Code und PostgreSQL-Dumps
  können ausführbare Inhalte enthalten.
- Vorhandene COMET-Verzeichnisse, Datenbanken, Rollen oder gleichnamige Konfigurationen
  werden nicht überschrieben. Kein `DROP DATABASE`, kein Restore mit `--clean`,
  kein Schema-Push, kein Seed, kein pauschaler Prozess-/Port-Kill.
- Original-Sicherungen behalten. Das Installationspaket enthält **keine** Sicherungen oder Zugangsdaten.
- Die Sicherung stellt den Stand zum Backup-Zeitpunkt wieder her. Neuere Änderungen
  des alten Servers sind darin nicht enthalten.

## 1. Installationspaket auf den neuen Server übertragen

Das Installationspaket zusätzlich auf den neuen Server nach `/srv/comet-restore`
hochladen und dort entpacken:

```text
/srv/comet-restore/comet-debian-deployment.tar.gz
```

```bash
sudo tar -xzf /srv/comet-restore/comet-debian-deployment.tar.gz -C /srv/comet-restore
```

Deine fünf Sicherungen liegen bereits unter `/srv/comet-restore`. Sie müssen nicht
erneut hochgeladen oder verschoben werden. **Auf dem neuen Server** prüfen:

```bash
sudo hostnamectl
sudo ls -lh /srv/comet-restore
sudo chmod 700 /srv/comet-restore
sudo chmod 600 /srv/comet-restore/comet_lkw.dump /srv/comet-restore/easy-verladung-*.tar.gz /srv/comet-restore/easy-verladung-server.env
sudo df -h /opt /var /srv
sudo df -i /opt /var /srv
```

Erwartete Dateinamen:

```text
/srv/comet-restore/comet_lkw.dump
/srv/comet-restore/easy-verladung-code.tar.gz
/srv/comet-restore/easy-verladung-offline.tar.gz
/srv/comet-restore/easy-verladung-pictures.tar.gz
/srv/comet-restore/easy-verladung-server.env
```

Die Dateinamen müssen genau wie oben lauten. `.env`-Kopien ebenfalls privat halten;
Zugangsdaten niemals in Chat, Screenshots oder öffentliche Web-Verzeichnisse geben.

## 2. Debian vorbereiten

```bash
sudo bash /srv/comet-restore/comet-debian-deployment/prepare-debian.sh --confirm-new-server
```

Das richtet signierte Paketquellen für PostgreSQL und Node.js ein und installiert
Node.js 24, PostgreSQL 18, Apache, Python, Git und Build-Werkzeuge. Bei belegten
Web-/App-Ports oder vorhandener COMET-Installation wird abgebrochen.
Es wird kein fremder Webserver gestoppt und keine Firewall global umgestellt.

## 3. Archive prüfen und installieren

Nur Strukturprüfung, noch ohne Import:

```bash
sudo python3 /srv/comet-restore/comet-debian-deployment/install.py \
  --check-only
```

Danach die eigentliche Installation:

```bash
sudo python3 /srv/comet-restore/comet-debian-deployment/install.py \
  --confirm-new-server
```

Der Standardpfad ist `/srv/comet-restore`; optional kann `--backup-dir` einen anderen
Pfad setzen. `--check-only` prüft weder Zugangsdaten noch Datenbank-Restore oder
Vollständigkeit aller Bildverweise.

### Was wird eingerichtet?

1. Code unter `/opt/comet/app`, Dienstbenutzer `comet`.
2. Archiv-eigenes **pnpm 10.26.1**, ohne globales pnpm zu ersetzen.
3. Offline-Abhängigkeiten mit unveränderter Lockdatei; Frontend und Backend bauen.
4. Neue lokale Datenbank `comet_lkw` und Rolle `comet_app`.
5. Atomarer Datenbank-Restore mit Besitzerzuordnung zum neuen App-Benutzer.
6. Bilder aus `pictures/` nach `/opt/comet/storage-data/`, unveränderte Unterpfade
   einschließlich `uploads/` und vorhandener Metadaten.
7. **Nur in der neuen Datenbank:** Speicher-Backend auf `local`, Speicherpfad auf
   `/opt/comet/storage-data`. Ein beliebiger alter absoluter Pfad wird nicht beschrieben.
8. Konfiguration aus der gesicherten `.env` als Daten einlesen, **nicht als Shellcode**.
   Alte Datenbankadresse wird durch die neue lokale Verbindung ersetzt; neues zufälliges
   Datenbankpasswort und neuer Sitzungsschlüssel. Bestehende Benutzerpasswörter bleiben
   aus dem Dump erhalten; alte Browser-Sitzungen werden auf der neuen Instanz ungültig.
9. Im gesicherten Code zwei begrenzte Schutzanpassungen: API nur an localhost und
   Scheduler nur bei nicht gesetztem `DISABLE_SCHEDULER=true`.
   Original der geänderten Startdatei: `/opt/comet/install/index.original.ts`.
10. Eigener systemd-Dienst `comet-api.service`, automatischer Start nach Neustart.
11. Lokaler Apache-Testzugang auf **127.0.0.1:8080**, API auf **127.0.0.1:3333**.
12. HTTP-Prüfung von Frontend und API. Bei fehlender API-Gesundheit kein erfolgreicher
    Abschluss und Dienststopp.

**Hintergrundjobs bleiben deaktiviert.** Manuelle Aktionen können weiterhin Mails/
Benachrichtigungen auslösen. Während des parallelen Tests deshalb zunächst nur lesen.
Ein `sendmail`-/SMTP-Problem wird nicht durch einen Datenbank-Restore behoben;
Mailtransport später bewusst mit einer eigenen Testadresse prüfen.

## 4. App sicher testen

Auf deinem eigenen Rechner einen SSH-Tunnel zum **neuen** Server öffnen:

```bash
ssh -N -L 8080:127.0.0.1:8080 DEIN_SSH_BENUTZER@NEUE_SERVER_IP
```

Dies ist ein lokaler SSH-Client-Aufruf; die übrigen Serverarbeiten laufen mit sudo.
Im Browser öffnen:

```text
http://127.0.0.1:8080/
```

Der Zugang ist nicht öffentlich. Cookies sind nur für diese lokale HTTP-Testphase
auf `COOKIE_SECURE=false` gesetzt. Vor öffentlichem Betrieb ist HTTPS erforderlich.
Prüfen: bestehende Benutzer/Rollen, Aufträge, Lagerdaten und mehrere vorhandene Bilder.
Die Gesundheit des API-Prozesses allein beweist nicht alle Fachfunktionen.

Status auf dem neuen Server:

```bash
sudo systemctl status comet-api.service --no-pager
sudo journalctl -u comet-api.service -n 80 --no-pager
sudo ss -ltnp
```

Protokolle nur lokal prüfen; sie können vertrauliche Daten enthalten.

## 5. HTTPS für die gewünschte Domain einrichten

Zunächst ein gültiges Zertifikat für genau diese Domain beschaffen. Nicht das
Zertifikat einer anders geschriebenen Domain verwenden. `fullchain.pem` muss die
Zertifikatskette enthalten, `privkey.pem` den passenden privaten Schlüssel.
Dieses Paket beschafft keine Zertifikate und verändert kein DNS.

Beispiel mit bereits vorhandenen Zertifikatsdateien:

```bash
sudo python3 /srv/comet-restore/comet-debian-deployment/enable-https.py \
  --domain DEINE-NEUE-DOMAIN.de \
  --certificate /etc/letsencrypt/live/DEINE-NEUE-DOMAIN.de/fullchain.pem \
  --key /etc/letsencrypt/live/DEINE-NEUE-DOMAIN.de/privkey.pem
```

Das erzeugt einen eigenen HTTPS-VirtualHost, setzt `COOKIE_SECURE=true` und die
öffentliche App-Adresse und prüft HTTPS lokal mit Hostnamen/Zertifikat **ohne
DNS-Umschaltung**. Hintergrundjobs bleiben deaktiviert. Bei Fehlern wird die
installer-eigene Freigabe deaktiviert und die vorherige lokale Env-Konfiguration
zurückkopiert; das ist **kein Datenbank-Rollback**.

Externen Zugriff vorher über eine separate Testdomain oder einen lokalen Hosts-Eintrag
für die neue Server-IP prüfen. Erst nach Prüfung gegebenenfalls DNS umstellen.
Der SSH-Testzugang ist nach Umstellung auf Secure-Cookies nicht mehr zum Anmelden geeignet.

## 6. Parallelbetrieb und endgültiger Wechsel

Der alte Server bleibt unangetastet. Zwei unabhängig beschriebene Datenbanken
synchronisieren sich nicht automatisch. Wenn der neue Server später die produktive
Instanz werden soll, vor dem Wechsel eine aktuelle zusammengehörige Datenbank- und
Bildsicherung übernehmen. Dafür müssen neue Schreibzugriffe kurz koordiniert werden;
der alte Server muss dafür nicht ausgeschaltet werden.

**Den Installer nicht einfach erneut ausführen:** Er lehnt bestehende Datenbanken ab.
Eine finale Nachsynchronisation/erneuter Import muss separat und ausdrücklich geplant
werden; es gibt absichtlich keinen automatischen destruktiven Austausch.

Jobs auf dem neuen Server nur aktivieren, wenn geklärt ist, welche Instanz zuständig
ist und keine doppelten Berichte/Erinnerungen verschickt werden. Dann lokal in
`/opt/comet/app/artifacts/api-server/.env` `DISABLE_SCHEDULER` auf `false` setzen und:

```bash
sudo systemctl restart comet-api.service
```

## Fehler und Updates

- Bei einem Abbruch private `/var/log/comet-restore-*.log` bzw. `comet-https-*.log`
  und den Dienststatus lokal prüfen. Kein blindes Wiederholen oder Löschen.
- Teilweise angelegte Dateien/Datenbanken bleiben zur Prüfung erhalten. Der Installer
  löscht sie nicht und übergeht keine vorhandenen Ziele.
- Bei fehlenden Offline-Paketen wird abgebrochen, nicht heimlich online nachinstalliert.
- Betrieb hier mit **systemd statt PM2**. Der bisherige PM2-/Git-basierte App-Updater
  wird damit nicht eingerichtet; ein Code-Tarball ist auch kein Git-Repository.
  Updates vorerst getrennt bauen und gezielt über systemd betreiben. Nicht die
  bestehende PM2-Anleitung ungeprüft auf diesen Dienst anwenden.
- Ein erfolgreicher Installationslauf prüft Build, Restore und HTTP-Erreichbarkeit,
  nicht automatisch alle Benutzeraktionen, E-Mail, externe Dienste oder einen echten Reboot.

## Prüfung dieses Pakets

Vor der Bereitstellung bestanden zwölf Tests für Archivschutz, Konfiguration und
Abbruchregeln. Zusätzlich wurden die hier vorliegenden Code-/Offline-Archive in einem
temporären Verzeichnis tatsächlich offline installiert und beide App-Builds erstellt.
Dabei wurde keine gesicherte `.env` geöffnet und keine Datenbankverbindung hergestellt.
Eine vollständige Debian-Installation einschließlich echtem PostgreSQL-Restore,
Apache/systemd und HTTPS wurde in dieser Entwicklungsumgebung **nicht** ausgeführt.

Die beigefügten Tests laufen ohne Installation, apt, echte Benutzerdaten oder
Produktionsdatenbank:

```bash
sudo python3 /srv/comet-restore/comet-debian-deployment/test_install.py
```
