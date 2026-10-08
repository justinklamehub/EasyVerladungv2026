---
name: Updates der installierten Chrome-App
description: Anforderung an Start/Resume und Sicherheitsgrenzen bei PWA-Updates.
---

Beim Start der über Chrome installierten App muss online der aktuellste verfügbare Build geladen werden, ohne dass der Benutzer manuell neu laden muss.

**Why:** Der Benutzer meldete, dass geänderte Menüpunkte und andere Neuerungen erst nach manuellem Neuladen sichtbar wurden.

**How to apply:** Kaltstart und Wiederaufnahme einer vorhandenen App-Instanz unterscheiden. Ein bereits im Hintergrund laufender Browser behält seinen alten JavaScript-Stand; ein Service-Worker-Update allein ersetzt diesen nicht. Änderungen deshalb auch bei der Rückkehr aus dem Hintergrund prüfen.

Automatische Updates dürfen begonnene Eingaben nicht verwerfen; bei solchen Eingaben eine bestätigte Aktualisierung anbieten. Ein nicht erreichbarer Versionsnachweis bedeutet „unbekannt“, nicht „aktuell“. Keine Neulade-Schleife bei veralteter HTML-Auslieferung.

**Why:** Ein Versionswechsel während einer begonnenen Verladung oder Nachricht kann sonst ungespeicherte Arbeit verlieren; bei Verbindungsproblemen lässt sich die neueste Version nicht feststellen.

**How to apply:** Fehlende Verbindung sichtbar machen und später erneut prüfen. Die externe Debian-/Apache-Installation nicht eigenständig ändern oder neu starten. Mutable HTML/PWA-Dateien sind von langfristigem Asset-Caching auszunehmen.

Produktions-Build-Prüfungen im Browser brauchen einen vom Testbrowser erreichbaren Ursprung; ein nur in der Workspace-Shell erreichbarer temporärer localhost-Port reicht nicht.

**Why:** Der isolierte Testserver antwortete per Shell, war aus dem Playwright-Kontext aber mit ECONNREFUSED unerreichbar. Der Browser-Test konnte deshalb nicht beginnen.

**How to apply:** Vor langen Tests die Erreichbarkeit über den Browser prüfen und einen korrekt gerouteten Preview-Ursprung verwenden. Logiktests und erfolgreiche Produktions-Builds nicht als Beweis eines durchgeführten Chrome-/Service-Worker-Tests ausgeben.
