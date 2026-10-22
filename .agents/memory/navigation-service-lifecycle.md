---
name: Hintergrunddienste und mobile Navigation
description: Warum Benachrichtigungen, Präsenz und Push nicht vom geöffneten Navigationsmenü abhängen dürfen.
---

Die Verladungsübersicht wird vom Benutzer „Monitor“ dauerhaft und ohne Eingaben angezeigt. Sie muss auch ohne eingehende Echtzeit-Meldungen automatisch aktuell bleiben.

Das Aktualisierungsintervall soll global einstellbar sein, nicht als benutzerspezifische Monitor-Sonderlösung.

**Why:** Der Nutzer möchte das Intervall zentral selbst definieren können.

**How to apply:** Änderungen auch in bereits geöffneten Übersichten übernehmen, unabhängig davon, ob deren Echtzeit-Verbindung funktioniert.

**Why:** Der Nutzer meldete eine nicht automatisch aktualisierte Anzeige beim untätigen Monitor-Benutzer.

**How to apply:** Tabellen- und Kartenübersicht unabhängig von Benutzername und Eingaben regelmäßig abgleichen; keine Seiten-Neuladungen erzwingen, die offene Formulare oder Filter verwerfen.

Hintergrunddienste der App bleiben aktiv, auch wenn eine temporäre mobile Navigation geschlossen und deren Inhalt ausgehängt wird.

**Why:** Ein nur bei geöffnetem Menü eingeblendeter Sidebar-Inhalt würde sonst Socket-Abonnements und die Meldung der aktuellen Seite beenden. Nachrichtenindikatoren und Online-Seitenangaben wären dann ohne sichtbaren Fehler veraltet.

**How to apply:** Die Lebensdauer dieser Dienste an die angemeldete App binden, nicht an Drawer, Popover oder Menüs. Bei Layoutänderungen auch den Zustand mit geschlossenem Menü prüfen; Desktop- und mobile Navigationspräferenzen getrennt behandeln.
