# Stempeluhr in Easy-Verladung

## Rechte

Das Modul ist über **Stempeluhr** in der Navigation erreichbar. Unter
**Berechtigungen → Stempeluhr** gibt es getrennte Rechte für Anzeigen,
Terminalfreigabe, Mitarbeiterverwaltung, Zeitkorrekturen, Stornieren, Export,
Einstellungen und Import. Neue Rechte sind für normale und benutzerdefinierte
Rollen zunächst ausgeschaltet; der Systemadministrator hat Zugriff.

## Terminal

1. Auf dem vorgesehenen Gerät mit einem berechtigten Easy-Konto anmelden.
2. Unter **Stempeluhr → Terminal** einen Gerätenamen vergeben und freischalten.
3. Das Easy-Konto abmelden und die **Terminal-Ansicht** öffnen.
4. Karten mit einem Tastatur-Barcodescanner einschließlich Enter scannen.

Das Terminal besitzt eine eigene, nicht auslesbare Browserfreigabe und braucht
keine Mitarbeiteranmeldung. Sie berechtigt ausschließlich zum Stempeln, nicht
zum Abrufen von Mitarbeiterlisten oder zur Verwaltung. Die Freigabe ist an diesen
Browser gebunden, gilt standardmäßig zwölf Stunden und lässt sich am Gerät oder
im Modul widerrufen. Auch die Deaktivierung oder der Entzug des Terminalrechts
beim freischaltenden Benutzer beendet den Zugriff.

Standardmäßig werden wiederholte Scans derselben Karte innerhalb von zehn
Sekunden abgewiesen. Wiederholungen derselben Anfrage verändern die Zeit nicht
erneut. Ohne erfolgreiche Serverantwort gilt ein Scan nicht als bestätigt;
die Oberfläche zeigt Fehler ausdrücklich an. Es gibt keine Offline-Stempelung.

## Zeitregeln

Alle Tagesgrenzen gelten für **Europe/Berlin**, unabhängig von der Gerätezeitzone.
Echte Scanzeit, korrigierte Zeit und gebuchte Zeit sind getrennt. Standard:

- Frühester gebuchter Beginn: **06:45 Uhr**.
- Spätestes gebuchtes Ende: **16:00 Uhr**, nur für Schichten am selben Kalendertag.
- Bis einschließlich **400 Minuten** gebuchter Anwesenheit: **15 Minuten** Pause.
- Ab **401 Minuten**: **30 Minuten** Pause.
- Ab **510 Minuten**: **45 Minuten** Pause.

Diese Regeln reproduzieren das alte System; sie sind keine Prüfung gesetzlicher
oder tariflicher Vorgaben. Unter Einstellungen können Grenzen deaktiviert und
Pausenstufen verändert werden. Jeder Eintrag speichert seinen Regelstand;
Einstellungsänderungen ändern bestehende Zeiten nicht rückwirkend.
Bei Korrekturen kann die Pause mit Begründung übersteuert werden. Offene Zeiten
haben noch keine Brutto-/Netto-Summe. Überlappungen werden abgewiesen.
Eine Frühschicht ganz vor der Startgrenze erhält null Minuten, nie negative Zeiten.

Datumsauswahl und Wochenberichte ordnen eine Schicht ihrem Kommen-Datum zu.
Nachtschichten bleiben vollständig erhalten, einschließlich echter Zeitumstellung.
Mehrdeutige oder nicht existierende manuell eingegebene Ortszeiten werden
abgewiesen. Ursprüngliche Scanzeiten bleiben bei Korrekturen unverändert.
Stornierte Zeiteinträge bleiben für Nachweise gespeichert.

## Altdaten übernehmen

Die alte ZIP enthält Anwendungscode, aber keinen Datenexport. Ein **SQL-Export
des Vorsystems** kann unter Import direkt ausgewählt werden. Er wird ausschließlich
als Text gelesen: nur INSERT-Datenwerte für `mitarbeiter` und `anwesenheit` werden
übernommen, niemals SQL-Befehle ausgeführt.

Wenn historische Buchungen auf nicht mehr vorhandene Mitarbeiter verweisen,
können deren eindeutige, in Buchungen gespeicherte Namen und Kartennummern mit der
entsprechenden Option als **inaktive Archivmitarbeiter** rekonstruiert werden.
Fehlende Dienstleister und Tätigkeiten bleiben leer; widersprüchliche Namen
werden abgewiesen. Historische Karten werden dadurch nicht zum Stempeln aktiviert.
Offene Einträge bleiben ohne erfundene Endzeit erhalten.

Alternativ werden **zwei UTF-8-CSV-Dateien mit Spaltenüberschriften** akzeptiert:

**mitarbeiter**

```text
id;mitarbeiterid;vorname;nachname;dienstleister;tatigkeit
```

**anwesenheit**

```text
id;mitarbeiterid;time_begin;time_end
```

`time_begin` und `time_end` sind die alten Unix-Zeitstempel in Sekunden.
Leeres `time_end`, `NULL` oder `0` bedeutet einen offenen Eintrag.
Kartennummern sind Text: führende Nullen dürfen beim Export nicht verloren gehen.
Jeder Anwesenheitseintrag benötigt seine unveränderte eindeutige alte `id`.
Alternativ ist eine normalisierte JSON-Datei mit `employees` und `entries`
entsprechend dem dokumentierten API-Vertrag möglich.

Unter **Stempeluhr → Import** Dateien auswählen, Hinweis auf bereits gerundete
Altzeiten bestätigen, Vorschau prüfen und anschließend Import bestätigen.

- Die Vorschau übernimmt keine Datensätze.
- Bei Fehlern wird der gesamte Import zurückgenommen, nicht teilweise gespeichert.
- Identische bereits importierte Datensätze werden übersprungen.
- Abweichende Mitarbeiterdaten oder gleiche Alt-IDs mit anderem Inhalt müssen
  vor dem Import geklärt werden. Vorhandene Datensätze werden nie überschrieben.
- Überlappende oder unplausible alte Einträge müssen zuerst bereinigt werden.
- Die ursprüngliche echte Scanzeit kann aus gekürzten Altzeiten nicht
  rekonstruiert werden. Importierte Zeiten werden nicht nochmals gekürzt;
  für ihre Pausen gilt der oben dokumentierte alte Regelstand.
- SQL-Dumps werden im Webmodul nur ausgewertet, niemals ausgeführt.
- Bei großen Dateien gegebenenfalls Teilmengen verwenden. Wird das Zeitbudget
  überschritten oder die Verbindung vor Abschluss unterbrochen, wird die
  Transaktion zurückgenommen. Eine erneute Übernahme identischer Datensätze
  erzeugt keine Duplikate.

## Betrieb und Grenzen

Die neuen Tabellen werden ergänzend und ohne Änderungen an bestehenden Daten
beim API-Start angelegt. Ein Datenbankwechsel ist nicht nötig. Bei einem fehlenden
Datenbankrecht wird ein Fehler protokolliert und im Modul angezeigt.
Mitarbeiter mit Zeitnachweisen werden deaktiviert statt gelöscht.
Berichte und CSV verwenden die sichtbaren Filter und weisen offene Zeiten aus.
Die Ansicht aktualisiert sich alle 15 Sekunden; das Protokoll zeigt maximal
500 Änderungen je Zeitraum. Ab mehr als 10.000 Anwesenheiten muss der Filter
eingeschränkt werden.
