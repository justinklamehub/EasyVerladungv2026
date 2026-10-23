---
name: Kalenderdaten und Server-Zeitzonen
description: Warum reine Datumswerte und ihre Tests nicht nur unter UTC betrachtet werden dürfen.
---

Reine fachliche Kalenderdaten sind keine Zeitpunkte. Ihre Übertragung darf keine Umrechnung über UTC auslösen. Regressionstests mit dem PostgreSQL-Treiber müssen neben UTC auch eine europäische Prozess-Zeitzone und Daten an Sommer-/Winterzeitgrenzen abdecken.

**Why:** Der PostgreSQL-Treiber kann DATE-Werte als lokale Mitternacht liefern. Eine anschließende UTC-Serialisierung verschob das ETA in der Abholplanung auf den Vortag. Tests unter UTC allein hatten diesen Fehler nicht sichtbar gemacht.

**How to apply:** Bei datumsbezogenen API-Änderungen auf unveränderte Kalenderdaten achten und Zeitzonen im Testprozess ausdrücklich variieren. Echte Zeitstempel wie Änderungszeiten bleiben davon getrennt und dürfen weiterhin als UTC-Zeitpunkte übertragen werden.
