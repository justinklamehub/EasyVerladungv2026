---
name: Hintergrunddienste und mobile Navigation
description: Warum Benachrichtigungen, Präsenz und Push nicht vom geöffneten Navigationsmenü abhängen dürfen.
---

Hintergrunddienste der App bleiben aktiv, auch wenn eine temporäre mobile Navigation geschlossen und deren Inhalt ausgehängt wird.

**Why:** Ein nur bei geöffnetem Menü eingeblendeter Sidebar-Inhalt würde sonst Socket-Abonnements und die Meldung der aktuellen Seite beenden. Nachrichtenindikatoren und Online-Seitenangaben wären dann ohne sichtbaren Fehler veraltet.

**How to apply:** Die Lebensdauer dieser Dienste an die angemeldete App binden, nicht an Drawer, Popover oder Menüs. Bei Layoutänderungen auch den Zustand mit geschlossenem Menü prüfen; Desktop- und mobile Navigationspräferenzen getrennt behandeln.
