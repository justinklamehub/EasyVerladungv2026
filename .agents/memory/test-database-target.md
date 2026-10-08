---
name: Datenbankziel vor Oberflächentests bestätigen
description: Warum eine Produktionsmarkierung im Replit-Laufzeitkontext nicht allein das Datenbankziel der Vorschau beweist.
---

Vor temporären Testdaten das tatsächliche Datenbankziel bestätigen, statt allein `REPLIT_ENVIRONMENT` als Datenbankzuordnung zu behandeln.

**Why:** Die Replit-Vorschau meldete `REPLIT_ENVIRONMENT=production`, obwohl der ausdrücklich ausgewählte Entwicklungs-Datenbankzugriff und die App-Verbindung dieselbe Datenbankinstanz erreichten. Der Oberflächentest stoppte deshalb vorsichtshalber vor seinen Testkonten. Die eigentliche COMET-Produktion läuft auf dem separaten Debian-Server.

**How to apply:** Mit `executeSql` ausdrücklich `environment: "development"` wählen und ausschließlich lesende Instanzmetadaten mit einer Abfrage über die tatsächliche App-Verbindung vergleichen. Keine Verbindungsstrings oder Umgebungsgeheimnisse ausgeben. Erst bei bestätigtem Entwicklungsziel eindeutig eigene temporäre Konten/Daten anlegen und anschließend entfernen; bei verbleibender Unsicherheit nicht schreiben. Eine Produktionsmarkierung niemals ohne diesen Abgleich ignorieren.

Der Browser-Tester hat nicht immer Zugriff auf den offiziellen SQL-Aufruf mit Umgebungsauswahl; sein `query(sql)`-Helper bietet diese Auswahl nicht.

**Why:** Der Tester stoppte vor Testdaten, weil er den verlangten Entwicklungsabgleich mit seinen eigenen Helfern nicht durchführen konnte. Eine zusätzliche Connector-Suche löst dieses Problem nicht.

**How to apply:** Den Abgleich im Hauptagenten über den offiziellen Entwicklungszugriff und die App-Verbindung durchführen und dem Tester die aktuellen übereinstimmenden Instanzmetadaten als Nachweis mitgeben. Der Tester darf anschließend seine vorhandene App-Verbindung für eindeutig eigene, anschließend bereinigte Testdaten nutzen; ohne diesen Nachweis bleibt die Schreibsperre bestehen.
