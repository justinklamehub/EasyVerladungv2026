---
name: Dropdown height with Tailwind CSS variables
description: Runtime constraint for long Radix selection lists in the current styling stack.
---

Bei der Höhenbegrenzung langer Auswahllisten CSS-Variablen ausdrücklich mit `var(...)` verwenden, nicht als bloßen Variablennamen in einer Arbitrary-Value-Klasse.

**Why:** Eine übernommene Maximalhöhen-Klasse mit bloßem CSS-Variablennamen ließ lange Listen über den Bildschirm hinauslaufen. Der Build meldete keinen Fehler, trotzdem waren benötigte Artikel im Dialog nicht auswählbar.

**How to apply:** Lange Listen auf die verfügbare Bildschirmhöhe begrenzen und intern scrollbar halten. Eine ausdrückliche `var(...)`-Höhenangabe hat im Browser funktioniert; ein erfolgreicher Build allein bestätigt dieses Verhalten nicht.
