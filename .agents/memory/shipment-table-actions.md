---
name: Verladungsbuttons und Statusfolge
description: Nutzerentscheidung zur Bedeutung von „Auf dem Hof“ und getrennten Aktionsrechten.
---

Für den Weiter-Button gilt die Folge „Angemeldet → Angekommen → in Verladung → Verladen“. „Auf dem Hof“ war die Beschreibung des Ankunftsschritts; der Nutzer hat ausdrücklich „Angekommen beibehalten“ ausgewählt.

**Why:** Eine Umbenennung oder ein zusätzlicher Status wurde als Alternative angeboten und nicht gewählt.

**How to apply:** Keine Migration nach „Auf dem Hof“ und keinen zusätzlichen Schritt einführen. „Erwartet“, „Abgefertigt“ und „Storniert“ nicht ungefragt in diese Folge aufnehmen.

Drucken und Weiter sind getrennt pro Rolle in den Einstellungen freigebbare COMET-Aktionen, unabhängig vom allgemeinen Bearbeitungsrecht.

**Why:** Der Nutzer verlangt getrennt einstellbare Nutzungsberechtigungen für beide Tabellenbuttons; die vorherige COMET-Beschränkung bleibt bestehen.

**How to apply:** Die vorhandene rollenbasierte Rechteverwaltung verwenden, nicht eine zweite Liste von Berechtigungen aufbauen. Ein separates Aktionsrecht darf kein allgemeines Bearbeitungsrecht benötigen oder erteilen.

Beim Wechsel per Weiter-Button von „Angemeldet“ zu „Angekommen“ müssen aktuelles Datum und Uhrzeit als ATA eingetragen werden.

**Why:** Der Nutzer verlangt den automatischen ATA-Eintrag ausdrücklich für diesen Buttonwechsel.

**How to apply:** Serverzeit in deutscher Ortszeit verwenden und ATA zusammen mit dem Status speichern. Spätere Weiter-Schritte dürfen die Ankunftszeit nicht erneut setzen.
