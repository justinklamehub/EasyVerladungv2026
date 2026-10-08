---
name: Unterschiedliche pnpm-Versionen auf Entwicklung und Debian
description: Warum ein erfolgreicher Entwicklungsinstallationslauf keine Prüfung der Debian-Buildrichtlinien ersetzt.
---

Paketmanager-Konfigurationsänderungen für COMET sowohl mit der Entwicklungs- als auch der tatsächlichen Debian-pnpm-Version prüfen. Nicht auf dem Live-Server experimentieren oder dessen globale Paketmanager vorschnell ersetzen.

**Why:** Die Entwicklung verwendet pnpm 10.26.1, Debian pnpm 11.7.0. Eine nur unter pnpm 10 funktionierende ältere Skriptfreigabe führte auf Debian zum Update-Abbruch trotz erfolgreicher Lockdateiprüfung.

**How to apply:** In getrennten temporären Verzeichnissen nur Workspace-Paketmanifeste, Konfiguration und Lockdatei kopieren und mit der jeweiligen CLI einen Frozen-Lockfile-Installationslauf prüfen. Benötigte Buildskripte gezielt freigeben; globale Freigabe aller Skripte und Installation im Live-App-Verzeichnis vermeiden. Serverversion bei späteren Arbeiten erneut prüfen.
