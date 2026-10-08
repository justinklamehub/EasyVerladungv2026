---
name: Systemmonitoring
description: Aussagegrenzen und Betriebssicherheit der Admin-Systemprüfungen.
---

Eine antwortende API allein beweist nicht, dass die vollständige App erreichbar ist. Dateiprüfung auf dem Server und tatsächliche HTML-/Asset-Auslieferung im Browser getrennt bewerten.

**Why:** Auf dem weiterhin benötigten Debian-Server antwortete die API, während Apache wegen einer fehlenden gebauten Einstiegsdatei HTTP 500 lieferte. Auch eine bereits geladene Seite kann einen späteren Auslieferungsfehler verdecken.

**How to apply:** Fehlende Dateien, HTTP-Fehler, unbrauchbare Asset-Antworten und Zeitüberschreitungen sichtbar machen. Nach fehlgeschlagener Statusabfrage keine alten erfolgreichen Ergebnisse als aktuellen Zustand darstellen.

Admin-Systemprüfungen bleiben rein lesend und beziehen sich ausschließlich auf die aktuell angesprochene Instanz.

**Why:** Der alte Server muss weiterlaufen; eine Statusabfrage darf weder Dienste stoppen noch Produktionsdaten, Bilder oder Speicherverzeichnisse verändern. Alte und neue Server werden nicht automatisch gemeinsam geprüft.

**How to apply:** Keine Testbilder, Verzeichnisse, Änderungen an Speichereinstellungen oder automatischen Reparaturen beim Prüfen erzeugen. Rechte-/Leseprüfungen nicht als erfolgreichen Schreib- oder Wiederherstellungstest ausgeben; Zugangsdaten und rohe Ausnahmetexte nicht im Bericht anzeigen.
