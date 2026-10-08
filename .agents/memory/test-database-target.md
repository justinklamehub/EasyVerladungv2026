---
name: Datenbankziel vor Oberflächentests bestätigen
description: Warum eine Produktionsmarkierung im Replit-Laufzeitkontext nicht allein das Datenbankziel der Vorschau beweist.
---

Vor temporären Testdaten das tatsächliche Datenbankziel bestätigen, statt allein `REPLIT_ENVIRONMENT` als Datenbankzuordnung zu behandeln.

**Why:** Die Replit-Vorschau meldete `REPLIT_ENVIRONMENT=production`, obwohl der ausdrücklich ausgewählte Entwicklungs-Datenbankzugriff und die App-Verbindung dieselbe Datenbankinstanz erreichten. Der Oberflächentest stoppte deshalb vorsichtshalber vor seinen Testkonten. Die eigentliche COMET-Produktion läuft auf dem separaten Debian-Server.

**How to apply:** Mit `executeSql` ausdrücklich `environment: "development"` wählen und ausschließlich lesende Instanzmetadaten mit einer Abfrage über die tatsächliche App-Verbindung vergleichen. Keine Verbindungsstrings oder Umgebungsgeheimnisse ausgeben. Erst bei bestätigtem Entwicklungsziel eindeutig eigene temporäre Konten/Daten anlegen und anschließend entfernen; bei verbleibender Unsicherheit nicht schreiben. Eine Produktionsmarkierung niemals ohne diesen Abgleich ignorieren.
