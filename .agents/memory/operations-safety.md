---
name: Update- und Sicherungssicherheit
description: Grenzen und Sicherheitsregeln für COMET-Betriebswerkzeuge und Wiederherstellungsproben.
---

Builds vor einer Übernahme getrennt erstellen und prüfen; alte gehashte Assets für bereits geöffnete Browser behalten. Nur den eigenen benannten Dienst neu starten, niemals alle Prozesse eines Ports beenden.

**Why:** Der bisherige Live-Build konnte die laufende index.html entfernen. Der alte Debian-Server muss weiterlaufen; ein fremder Dienst darf nicht durch einen Port-Kill betroffen sein.

**How to apply:** Keine Live-dist-Verzeichnisse als Build-Ziel verwenden. Rückkehr zu vorherigen Builds nicht als Datenbank-Rollback oder vollständiges Zero-Downtime-Update darstellen.

Hintergrund-Updates dürfen weder vom Browserkontakt noch von der Lebensdauer des API-Prozesses abhängen. Abschluss nur aus gespeichertem Ergebnis bestätigen.

**Why:** Ein Update startet die API selbst neu; eine abreißende SSE-Verbindung ist deshalb kein Beweis für Erfolg oder Fehlschlag.

**How to apply:** Prozess von der API entkoppeln, exklusiven Lock über den Neustart behalten und fehlenden Kontakt als unbekannten Zustand anzeigen. Keine Mutationen über GET.

Wiederherstellungsproben bleiben in einer eigenen PostgreSQL-Instanz mit privatem Unix-Socket und separater Bildablage. Kein Rückspielen auf die laufende Instanz und kein automatisches Überschreiben von Produktionsdaten.

**Why:** Zwischen Sicherung und Update können bereits neue Geschäftsdaten entstehen. Ein automatisches Datenbank-Rollback würde diese verlieren.

**How to apply:** Isolierte Tabellen-/Zeilen- und Datei-Prüfsummenprüfungen nicht als vollständigen App- oder Cloud-Restore ausgeben. Alte positive Nachweise bei fehlgeschlagener Neuprüfung invalidieren.

Öffentliche Update-Fehlerhinweise aus einem festen Katalog ableiten, niemals durch bloßes Schwärzen von Protokolltext. Auch gespeicherte Texte vor der API-Ausgabe als nicht vertrauenswürdig behandeln.

**Why:** Installationsfehler können vertrauliche Umgebungswerte und Verbindungsangaben im selben Text wie einen harmlosen Fehlercode enthalten. Ein festes Vokabular verhindert, dass unbekannte Geheimnisformate durch einen unvollständigen Filter gelangen.

**How to apply:** Neue bekannte Ursachen gezielt als freigegebene Codes und feste Hinweise ergänzen; unbekannte Ursachen allgemein benennen. Kein automatisches Hochladen oder Anzeigen privater Logs zur Fehlerdiagnose.

PostgreSQL-Serverwerkzeuge müssen zur Version des verwendeten pg_dump passen; pg_config ist optional.

**Why:** Die Replit-Nix-Installation bietet pg_dump, initdb und postgres, aber kein pg_config im ausführbaren Paket. Ein zwingender pg_config-Aufruf verhinderte eine ansonsten mögliche Prüfung.

**How to apply:** Passende ausführbare Werkzeuge direkt finden oder einen expliziten Installationspfad verwenden; keine andere Version stillschweigend wählen.
