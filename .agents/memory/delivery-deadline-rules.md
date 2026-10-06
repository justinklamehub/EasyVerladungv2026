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

„Gedruckt/exportiert soll immer nur das, was gerade aktiv gefiltert ist.“

**Why:** Der Nutzer verlangt ausdrücklich, dass Drucken und Exportieren in der Ansicht „Liefertermine“ die aktive Auswahl respektieren.

**How to apply:** Status-/KW-Filter und Textsuche gemeinsam berücksichtigen. Druck-/Exportsummen ausschließlich aus dieser Auswahl bilden, nicht aus allen geladenen Aufträgen.

Regalnamen dürfen beim Öffnen eines Liefertermin-Exports in Excel nicht als Datum interpretiert werden.

**Why:** Der Nutzer meldete, dass Excel Regalnamen im CSV-Export als Datum formatiert. CSV-Anführungszeichen verhindern Excels automatische Typerkennung nicht.

**How to apply:** Excel-Exporte mit expliziten Textzellen für Regalbezeichnungen erzeugen; führende Nullen und datumsähnliche Namen unverändert erhalten.

„Bei Liefertermine und beim Export/Druck muss es auch noch unterteilt nach Lieferungsnummer (die mit 8 Anfängt) aufgelistet sein.“

**Why:** Der Nutzer verlangt die Trennung nach Lieferung auch bei ansonsten gleichem Regal und Termin.

**How to apply:** Lieferungen anhand der mit 8 beginnenden Nummer unterscheiden und Paletten je Lieferung zählen; Verkaufsbelege nicht mit Lieferungsnummern verwechseln. Dieselbe Aufteilung in Ansicht, Export und Druck verwenden.
