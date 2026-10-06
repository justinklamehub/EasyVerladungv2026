# Gesamten COMET-Einlagerungsstand auf den eigenen Server übernehmen

## Inhalt und Grenzen

Das Paket enthält Lagerstruktur (Hallen, Gänge, Regale einschließlich Voll-Markierungen),
Artikel, Kundengruppen, Einlagerungsstrategien, lokale Speditionszuordnungen,
Vormerkungen, alle gespeicherten CSV-Importstände und den Einlagerungsverlauf.
Archivierte Originaldaten aus früheren Übernahmen (`legacy:*`) bleiben ebenfalls
erhalten; sie werden nicht als neue aktive Importstände interpretiert.
Auch Einlagerungseinstellungen einschließlich Farben, Importprofilen und
Liefertermin-Grenzen sind enthalten.

**Nicht enthalten und nicht verändert:** Benutzer/Passwörter, Rollen/Rechte,
globale Speditionsstammdaten, Verladungen, Palettenkonten und andere Einstellungen.
Die gewählte Ansicht und Spaltenauswahl im Browser sind keine Datenbankdaten und
werden nicht übertragen.

**Achtung: Der Import ERSETZT den gesamten Einlagerungsstand des Zielsystems.**
Er führt ihn nicht mit bereits vorhandenen produktiven Vormerkungen oder
Lagerstrukturen zusammen. Der vorherige Einlagerungsstand wird zwingend separat
gesichert. Bei einem Fehler wird die Datenbanktransaktion zurückgerollt.
Deshalb zuerst prüfen, Ergebnis kontrollieren und ein Wartungsfenster verwenden.
Das ist ein administrativer Server-Import, kein CSV-Import im Browser.

## Voraussetzungen

1. Aktuelle COMET-Version auf dem eigenen Server installieren. Bestehende
   Server-Konfiguration beibehalten; **keine Replit-Zugangsdaten übernehmen**.
2. Einlagerung im Produktivsystem einmal öffnen, damit ihre Tabellen vorhanden sind.
3. Node.js 22 und die bereits installierten COMET-Projektabhängigkeiten verwenden.
4. Die `.env` des Servers muss seine eigene `DATABASE_URL` enthalten. Diese Datei
   und die Zugangsdaten niemals hochladen oder weitergeben. Liegt `.env` an
   anderer Stelle, nur den Pfad bei `--env-file` anpassen.
5. Das Transferwerkzeug unter `tools/einlagerung-transfer/` im COMET-Projekt
   ablegen. Es benötigt nur das bereits verwendete PostgreSQL-Paket `pg` aus
   `lib/db`; keine zusätzliche Installation ist erforderlich.

## 1. Dateien hochladen

Das ZIP enthält:

- `einlagerung-stand.json` – der exportierte Stand, einschließlich Prüfsumme
- `tools/einlagerung-transfer/` – das Werkzeug und diese Anleitung

ZIP entpacken, das Verzeichnis `tools/einlagerung-transfer/` in das
COMET-Projekt übernehmen. Die JSON-Datei außerhalb des öffentlich ausgelieferten
Webverzeichnisses speichern, zum Beispiel in einem privaten Unterordner
`transfer/` im Projektverzeichnis. Nicht nach `public/` kopieren.
ZIP, Export und spätere Sicherungsdatei enthalten Geschäftsdaten und müssen
geschützt aufbewahrt werden.

Die folgenden Befehle werden **im COMET-Projektverzeichnis auf dem eigenen
Server** ausgeführt, nicht hier in Replit. Beispielpfade bei Bedarf anpassen.

## 2. Nur prüfen – keine Änderungen

```bash
node --env-file=.env tools/einlagerung-transfer/cli.mjs check \
  --file transfer/einlagerung-stand.json
```

Die Ausgabe zeigt Quelle, bisherigen Zielstand und die Speditionszuordnungen.
`check` läuft in einer schreibgeschützten Datenbanktransaktion. Wenn Tabellen
fehlen, die Datei beschädigt ist oder Zuordnungen unklar sind, wird abgebrochen.
Vor dem Import muss die Prüfung erfolgreich sein.

### Speditionen mit unterschiedlichen internen IDs

Das Werkzeug kopiert **keine** globalen Speditionsdatensätze. Es ordnet zuerst
nach eindeutigem Kürzel zu, andernfalls nach eindeutigem Namen. Interne
Einlagerungsreferenzen werden ebenfalls auf die neu angelegten Ziel-IDs umgesetzt.

Fehlende globale Speditionen im Produktivsystem über COMET anlegen.
Bei abweichenden Kürzeln/Namen eine separate `zuordnung.json` verwenden:

```json
{
  "12": 37
}
```

**Nur ein Beispiel:** Links steht die Speditions-ID im Export, rechts die
passende vorhandene Speditions-ID im Produktivsystem. Nicht ungeprüft verwenden.
Die Quelldaten stehen im Abschnitt `carriers` der Exportdatei. Den Export selbst
nicht bearbeiten; seine Prüfsumme würde ungültig.

```bash
node --env-file=.env tools/einlagerung-transfer/cli.mjs check \
  --file transfer/einlagerung-stand.json \
  --carrier-map transfer/zuordnung.json
```

## 3. Import nach Prüfung und Sicherung

Nach erfolgreicher Prüfung die Einlagerung während des Imports nicht bearbeiten.
Bestehende Browseransichten können alte Daten anzeigen; danach unbedingt neu laden.
Für den Import ausdrücklich den Austausch des Einlagerungsstands bestätigen:

```bash
node --env-file=.env tools/einlagerung-transfer/cli.mjs import \
  --file transfer/einlagerung-stand.json \
  --replace-einlagerung \
  --backup transfer/einlagerung-vor-import.json
```

Falls Schritt 2 eine manuelle Speditionszuordnung benötigt hat, auch hier
`--carrier-map transfer/zuordnung.json` ergänzen.

Die Sicherungsdatei wird **vor der ersten Datenänderung** mit restriktiven
Dateirechten erstellt. Eine bereits vorhandene Sicherungsdatei wird nicht
überschrieben: für jeden Import einen neuen Sicherungsnamen verwenden.
Scheitert die Sicherung oder eine weitere Prüfung, werden keine Daten ersetzt.
Der tatsächliche Austausch erfolgt vollständig in einer Datenbanktransaktion.
Andere Tabellen und andere Schlüssel der Einstellungstabelle bleiben unverändert.

Anschließend COMET neu laden und Lagerplan, Aufträge, Vormerkungen und
Liefertermin-Einstellungen kontrollieren. Das Paket ist eine Momentaufnahme vom
Exportzeitpunkt; spätere Änderungen aus Replit sind nicht darin enthalten.

## Bei Bedarf zurück zum vorherigen Einlagerungsstand

Zuerst die Sicherung prüfen, dann wie eine normale Transferdatei importieren:

```bash
node --env-file=.env tools/einlagerung-transfer/cli.mjs check \
  --file transfer/einlagerung-vor-import.json

node --env-file=.env tools/einlagerung-transfer/cli.mjs import \
  --file transfer/einlagerung-vor-import.json \
  --replace-einlagerung \
  --backup transfer/einlagerung-vor-rueckkehr.json
```

Auch die Rückkehr ersetzt die Einlagerung vollständig, einschließlich Änderungen,
die nach dem ersten Import im Produktivsystem erfolgt sind. Vorher prüfen.

## Später einen neuen Export erstellen

```bash
node --env-file=.env tools/einlagerung-transfer/cli.mjs export \
  --file transfer/einlagerung-neuer-stand.json
```

Vorhandene Dateien werden nicht überschrieben. In dieser Replit-Umgebung ist die
Datenbank bereits über die Umgebung konfiguriert; hier kann `--env-file` entfallen.
