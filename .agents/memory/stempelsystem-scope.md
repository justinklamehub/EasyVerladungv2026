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

Terminalfreigaben sollen auch zeitlich unbegrenzt möglich sein, aber weiterhin gesperrt und widerrufen werden können. Benutzer-Deaktivierung und Berechtigungsentzug müssen auch unbegrenzte Freigaben beenden.

**Why:** Der Nutzer möchte die Terminallaufzeit auf „Unbegrenzt“ schalten können; das hebt die Zugangsabsicherung nicht auf.

**How to apply:** Eine Laufzeitänderung nicht stillschweigend auf bestehende Freigaben anwenden oder abgelaufene Freigaben wiederbeleben. Für die neue Laufzeit das Gerät ausdrücklich erneut freischalten. Browserseitiger Verlust der Gerätefreigabe kann weiterhin eine erneute Freischaltung erfordern.

Mitarbeiter-Kartennummern automatisch fortlaufend im bisherigen Format vergeben und nicht bearbeitbar machen. Vorhandene Karten und historische Zuordnungen unverändert lassen.

**Why:** Der Nutzer verlangt bei der Mitarbeiteranlage eine automatische, nicht bearbeitbare Kartennummer „praktisch auto increment“, aber im bisherigen Format.

**How to apply:** Die Formularanzeige ist nur eine Vorschau; endgültig serverseitig beim Speichern vergeben. Nummern nach Löschung nicht wiederverwenden und bei Importen den höheren vorhandenen Nummernstand berücksichtigen. Historische Imports müssen ursprüngliche Kartennummern weiterhin erhalten.

CSV-Spaltenlayouts sind persönliche Einstellungen pro Benutzerkonto, keine globalen Zeit- oder Pausenregeln.

**Why:** Die Exportauswahl und eigene Überschriften dürfen die Exporte anderer Mitarbeiter nicht unbeabsichtigt verändern. Diese Trennung ist eine technische Scope-Entscheidung zur individuellen Spaltenkonfiguration.

**How to apply:** Auswahl, Beschriftung, Reihenfolge und Anzeigeformat getrennt von der Zeitberechnung speichern. CSV-Anpassungen dürfen die zugrunde liegenden Buchungen und Arbeitszeitberechnungen nicht verändern.

Beim Bearbeiten von Zeiten muss die Begründung optional sein.

**Why:** Der Nutzer hat ausdrücklich verlangt, das bisherige Pflichtfeld beim Bearbeiten optional zu machen.

**How to apply:** Korrekturen auch ohne Begründung zulassen, weiterhin protokollieren. Daraus keine Änderung der Begründungspflicht beim Löschen oder manuellen Anlegen ableiten.

Der optionale Grund soll am Eintrag in der Anwesenheitsübersicht und beim Download sichtbar sein und beim erneuten Bearbeiten vorausgefüllt werden. Explizites Leeren entfernt die aktuelle Notiz, nicht den Änderungsverlauf; ein ausgelassenes Feld darf eine vorhandene Notiz nicht löschen.

**Why:** Der Nutzer verlangt die Anzeige und den Export des Grundes. Historisch wurde das Bearbeitungsfeld immer leer geöffnet und der Text nur im Verlauf gespeichert: alte leere Korrekturgründe sind deshalb keine verlässliche Aufforderung, die letzte sinnvolle Notiz zu löschen.

**How to apply:** Für Altdaten einmalig den letzten nicht leeren Grund einer Zeitkorrektur/manuellen Anlage übernehmen, keine fremden Auditaktionen. Nach der Übernahme eine bewusst geleerte Notiz nicht aus dem Verlauf wiederherstellen. Persönliche CSV-Spaltenreihenfolge und Überschriften beim Ergänzen neuer Felder erhalten.

In der Stempeluhr müssen Schichten angelegt und pro Mitarbeiter zugeteilt werden können. Die Stundenberechnung muss die Schichten berücksichtigen. Wöchentliche Wechselschichten sind ausdrücklich gewünscht: „Wenn ich diese Woche Frühschicht habe, habe ich die Woche drauf Spätschicht.“

**Why:** Der Nutzer verlangt ein klügeres System mit erstellbaren Schichten, individueller Zuteilung und automatischem Wochenwechsel statt ausschließlich gemeinsamer Zeitgrenzen.

**How to apply:** Schichtzuordnung und wöchentliche Rotation in die bestehende Stempeluhr integrieren. Der Nutzer hat „Gestempelte Zeit innerhalb der Schicht“ bestätigt: nur tatsächlich gestempelte Anwesenheit innerhalb der zugewiesenen Schicht anrechnen, abzüglich Pause. Keine pauschale Gutschrift der geplanten Schichtstunden und keine automatische Gutschrift für zu frühes Kommen oder zu spätes Gehen.

Neue Schichtpläne und spätere Planänderungen dürfen bereits gespeicherte Buchungen nicht stillschweigend rückwirkend neu bewerten. Mitarbeiter ohne Schichtzuordnung verwenden weiterhin die bisherigen allgemeinen Regeln.

**Why:** Die Einführung der Planung soll vorhandene Zeiterfassungs- und Importdaten nicht nachträglich verändern oder unzugeteilte Mitarbeiter von der bisherigen Zeiterfassung ausschließen. Dies ist eine bewusste Kompatibilitätsentscheidung, keine pauschale rückwirkende Umstellung.

**How to apply:** Neue Buchungen berücksichtigen den dann geltenden Plan; auch über einen Wochenwechsel hinweg behalten bestehende Buchungen ihre Berechnungsgrundlage. Eine nachträgliche Neubewertung alter Zeiträume wäre eine gesonderte, ausdrücklich freizugebende Funktion.

Die Schichtzuweisung soll einfach und auch für mehrere Mitarbeiter gleichzeitig möglich sein.

**Why:** Der Nutzer verlangt ausdrücklich eine einfachere Zuweisung „auch in masse“, nicht nur wiederholtes Ausfüllen eines Einzelmitarbeiterformulars.

**How to apply:** Bei Weiterentwicklungen der Schichtzuweisung die gemeinsame Bearbeitung einer Mitarbeiterauswahl berücksichtigen; nicht wieder auf ausschließlich einzelne Zuweisungsvorgänge zurückgehen.

Der Schichtfilter soll Früh-/Spätschicht beziehungsweise die im Tab „Schichten“ angelegten Definitionen anbieten, nicht nur Schichtnamen aus geladenen Zeitbuchungen.

**Why:** Der Nutzer hat die ursprüngliche, nur aus Buchungen erzeugte Auswahl ausdrücklich korrigiert.

**How to apply:** Die Auswahl unabhängig von Zeitraum und Mitarbeiter aus den Schichtdefinitionen laden. Historische Schichtnamen zusätzlich erhalten; alte Buchungen nicht nach aktuellen Plänen umdeuten.
