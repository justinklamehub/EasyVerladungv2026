---
name: Eingabekontinuität im interaktiven Livebild
description: Warum regelmäßige Livebild-Updates keine neuen iframe-Dokumente erzeugen dürfen.
---

Bei interaktiver Fernsteuerung das Sandbox-Dokument und das tatsächlich fokussierte Eingabeelement während laufender Tastatureingaben erhalten. Zwischen zwei aktuellen Livebildern eingetroffene Befehle müssen ihrem ursprünglichen Bild zugeordnet bleiben, statt mit der neuesten Bildkennung umetikettiert zu werden.

**Why:** Der Browsertest verlor regelmäßig Buchstaben bei langsamem Tippen über mehrere Livebild-Updates: Dokumentwechsel unterbrachen native Tastatursequenzen, und ein sofortiger Token-/Bildwechsel verwarf noch unterwegs befindliche Nachrichten. Das lokale Wiederherstellen des Texts allein löste dies nicht.

**How to apply:** Bei Änderungen an der Livebild-Aktualisierung einen tatsächlichen mehrsekündigen Tippvorgang prüfen, nicht nur das Setzen eines ganzen Feldwerts. Eingabekontinuität darf die Quellenprüfung, die Bindung an frische Bilder oder den sofortigen Steuerungsstopp nicht umgehen.
