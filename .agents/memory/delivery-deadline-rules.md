---
name: Lieferterminwarnungen
description: Nutzervorgaben und vorsichtige Interpretation von Lieferterminen der eingelagerten Aufträge.
---

„Ich möchte dynamisch die Grenzen in den Einstellungen tätigen können.“ Die Warnstufen für eingelagerten Aufträge sollen auf dauerhaft gespeicherten, veränderbaren Tagesgrenzen beruhen.

**Why:** Der Nutzer hat feste Tagesgrenzen abgelehnt und ausdrücklich Änderungen über die Einstellungen verlangt.

**How to apply:** Änderungen müssen vorhandene Aufträge neu einstufen. Überfällige genaue Liefertermine bleiben kritisch. Startwerte sind 2 / 7 / 14 Tage, nicht unveränderliche Geschäftsregeln.

Bei KW-Lieferterminen zählen Resttage bis Montag (KW-Beginn). Auch KW-Termine verwenden die eingestellten Tageswarnstufen; die Anzeige kennzeichnet ausdrücklich „KW-Beginn (Montag)“.

**Why:** Der Nutzer hat die vorherige Sonntag-Regel ausdrücklich geändert: „Bei KW Terminen bitte den Montag nutzen statt den Sonntag in der KW“.

**How to apply:** ISO-Wochenjahre beachten. Montag ist „Heute“, ab Dienstag ist der KW-Liefertermin überfällig. App-Anzeige und Mail müssen dieselbe Berechnung verwenden. Vormerkungen behalten ihre separate Sonntag/Plus-KW-Regel.

Plus-KW bleibt bei Lieferterminen eine Zusatzangabe und verlängert die Frist nicht automatisch; fehlende oder ungültige Termine nicht als unkritisch einstufen.

**Why:** Eine Fristverlängerung wurde nur für Vormerkungen bestätigt, nicht für die Liefertermine der eingelagerten Aufträge.

**How to apply:** Die Regeln für Vormerkungen nicht auf die Lieferterminwarnung übertragen.

Die Liefertermin-Mail soll täglich nur bei enthaltenen Terminen innerhalb der eingestellten Mail-Frist oder überfälligen Terminen gesendet werden. Der Mail-Inhalt ist auswählbar; standardmäßig nur kritisch/überfällig und bald fällig, nicht unkritische Termine. Die Lagerübersicht bleibt vollständig.

**Why:** Der Nutzer hat den ursprünglichen Vollversand geändert: „Die Unkritischen müssen nicht in der Mail selbst sein, nur die Kritischen/Überfälligen oder Bald Fälligen“ und eine Einstellung vorgeschlagen. Mail-Frist und Vorlage bleiben frei konfigurierbar.

**How to apply:** Kategorien anhand der Lagerwarnstufen auswählen; Versand nur auslösen, wenn ein enthaltener Termin die eigene Mail-Frist erfüllt. Keine leeren Mails senden. 0 bedeutet heute bzw. überfällig; KW nach Montag-Regel. Vorschau, Summen, Text und HTML müssen dieselbe gespeicherte Auswahl/Vorlage verwenden.
