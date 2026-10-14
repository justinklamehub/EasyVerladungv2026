---
name: Stempelsystem-Modul
description: Vom Nutzer vorgegebener Integrationsumfang für die Zeiterfassung.
---

Das angehängte alte, laut Nutzer ziemlich verbuggte Stempelsystem dient als funktionale Vorlage. Das jetzige System soll in die Easy-Verladung eingebaut werden, als eigenes Modul mit Berechtigungssetzung und Einstellungsmöglichkeiten für Pausen.

**Why:** Der Nutzer hat diese Integration ausdrücklich verlangt; keine separate Anwendung und keine unveränderte Übernahme des verbuggten Systems.

**How to apply:** Funktionsumfang am Altprojekt prüfen, das Modul in die bestehende Anwendung und deren konfigurierbare Rechteverwaltung integrieren. Fachliche Zeit- und Zugangsregeln nicht aus den Fehlern des Altsystems ableiten.

Der Nutzer hat bestätigt: freigeschaltetes Terminal ohne eigene Mitarbeiteranmeldung; alte Zeit- und Pausenregeln als einstellbare Startwerte; Mitarbeiter und Zeiten aus dem alten System übernehmen.

**Why:** Diese drei Alternativen wurden ausdrücklich ausgewählt. Die alte ZIP enthält keine Datenbankdaten; die Altdaten stammen aus einem separat bereitgestellten SQL-Export.

**How to apply:** Keine öffentlich frei nutzbare Stempel-API anbieten. Altdaten nicht erfinden oder aus dem Anwendungscode ableiten. Bei Datenübernahme auf den bereits gekürzten Altzeitstempel hinweisen; echte Originalscans lassen sich daraus nicht rekonstruieren.

Fehlende historische Mitarbeiter dürfen aus eindeutig zugeordneten Namen und Kartennummern der alten Buchungen als inaktive Archivmitarbeiter rekonstruiert werden; unbekannte Dienstleister und Tätigkeiten bleiben leer. Bei widersprüchlichen Namen nicht raten. Offene alte Einträge bleiben offen.

**Why:** Der bereitgestellte SQL-Export enthält Buchungen, deren ursprüngliche Stammdatensätze fehlen. Die Historie soll vollständig erhalten bleiben, ohne alte Karten unbeabsichtigt wieder zum Stempeln freizugeben oder Endzeiten zu erfinden.

**How to apply:** SQL nur als Datenformat auswerten, niemals als Befehle ausführen. Vor Import eine vollständige transaktionale Vorschau prüfen; bestehende Daten nicht überschreiben und identische Wiederholungen überspringen.
