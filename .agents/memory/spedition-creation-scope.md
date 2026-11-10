---
name: Speditionsanlage und LKW-Arten
description: Nutzeranforderungen zur Anlage für freigegebene Speditionen und zu individuellen LKW-Arten.
---

Beim LKW-Anlegen sollen Speditionen zwischen sich selbst und den freigegebenen Speditionen wählen können.

**Why:** Der Nutzer verlangt ausdrücklich diese Auswahl im Zusammenhang mit den Speditionsfreigaben.

**How to apply:** Die bestehende Unterscheidung zwischen Lesen und Bearbeiten wahren; reine Lesefreigaben sind keine Anlageberechtigung. Die Auswahl muss beim Speichern durchgesetzt werden.

Bei Einzel- und Massenanlage soll bei vorhandener Speditionsfreigabe immer abgefragt werden, ob die Verladungen wirklich für die gewählte Spedition angelegt werden sollen; auch bei Auswahl der eigenen Spedition.

**Why:** Der Nutzer verlangt diese ausdrückliche Bestätigung bei jeder Anlage mit vorhandener Freigabe.

**How to apply:** Die tatsächlichen Zielspeditionen und bei Massenanlage deren jeweilige Anzahl nennen. Die Spedition muss direkt in diesem Bestätigungsdialog änderbar sein. Abbrechen darf keine Verladung anlegen; Bearbeitungen bestehender Verladungen sind nicht gemeint.

„LKW Arten sollte auch pro Spediteur einstellbar sein. Nicht jeder soll jede Art sehen / nutzen können.“

**Why:** Dies ist die ausdrücklich genannte fachliche Anforderung des Nutzers.

**How to apply:** Die Einschränkung betrifft die Speditionsbenutzer, nicht die interne COMET-Bearbeitung. Beim Anlegen für eine andere Spedition dürfen deren Freigaben die Einschränkung der handelnden Spedition nicht umgehen. Vorhandene historische LKW-Arten nicht durch eine nachträgliche Beschränkung löschen.

Bestehende Verladungen sollen sich per Mehrfachauswahl einer anderen Spedition zuordnen lassen, wie bei der Status-Massenänderung.

**Why:** Der Nutzer verlangt ausdrücklich dieselbe Möglichkeit für Speditionen.

**How to apply:** Keine neue Anlage auslösen; vorhandene Bearbeitungsrechte und die Beschränkung von Speditionswechseln auf interne Bearbeitung beibehalten.

Speditionen dürfen vor einer COMET-Bearbeitung weiterhin alle bisherigen Speditionsfelder am LKW ändern. Sobald COMET mit dem LKW etwas gemacht hat (z. B. Deckblatt gedruckt), dürfen sie nur ETA-Uhrzeit, Beschreibung/Bezeichnung, Kennzeichen und Subspedition ändern.

**Why:** Der Nutzer hat die bisherige pauschale Einschränkung korrigiert und die zwei vom Bearbeitungsstand abhängigen Fälle ausdrücklich vorgegeben.

**How to apply:** Bearbeitungsrecht und eigene bzw. zur Bearbeitung freigegebene Spedition bleiben erforderlich; Lesefreigaben reichen nicht. Interne COMET-Felder bleiben intern. Nach COMET-Bearbeitung Datum und übrige Felder auch serverseitig schützen, einschließlich alternativer Verschiebewege. Die vier verbleibenden Felder sind trotz Sperre, Druck oder Ankunft bearbeitbar.

Speditionen dürfen einen LKW stornieren, solange COMET ihn nicht bearbeitet und kein Deckblatt gedruckt hat.

**Why:** Der Nutzer verlangt diese Ausnahme für die Stornierung ausdrücklich; andere operative Statuswechsel bleiben COMET vorbehalten.

**How to apply:** Eigene und zur Bearbeitung freigegebene Verladungen mit Bearbeitungsrecht stornierbar machen. COMET-Aktivität und Druck serverseitig auch bei gleichzeitigen Änderungen absichern. Stornieren bedeutet Status „Storniert“, nicht Löschen.
