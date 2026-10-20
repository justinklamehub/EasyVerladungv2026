---
name: React-Zustand bei Live-Updates
description: Kompatibler Filterzustand und zeitlich versetzte Aktualisierung von Abfrage-Cache und Komponenten-Props.
---

Beim Ergänzen eines Feldes in einem React-Filterobjekt nicht voraussetzen, dass bereits geöffnete Ansichten den neuen Initialzustand bekommen. Neue Felder beim Lesen mit einem passenden Standardwert behandeln, ohne bestehende Filter zurückzusetzen.

**Why:** Fast Refresh erhält vorhandenen React-State. Eine neue Typdefinition und ein erweiterter Initialzustand ändern diesen nicht; ein direkter Zugriff auf das neue Feld kann trotz erfolgreicher Typprüfung eine geöffnete Ansicht zum Absturz bringen.

**How to apply:** Neue Filterfelder abwärtskompatibel lesen, auch in Eingabewerten, Filterzählern und Exportmetadaten. Tests sollen zusätzlich Filterobjekte ohne das neue Feld prüfen.

Das vorübergehende Fehlen einer gerade angelegten Entität in den übergebenen Abfragedaten beweist keine Löschung oder Schließung.

**Why:** Im Scanner konnte die lokale Auswahl bereits auf eine neue Liste zeigen, während der Eltern-Render noch den vorherigen Abfragestand lieferte. Ein vorschneller Schließungs-Effekt setzte dadurch eine erfolgreich angelegte Liste sofort zurück.

**How to apply:** Entfernen/Schließen erst aus einer späteren Abfrage ableiten, nachdem die gewählte Entität mindestens einmal im Abfragestand beobachtet wurde. Den Start einer neuen Entität und ihre erfolgreiche Speicherung im Browser gemeinsam prüfen; Typprüfungen erkennen diese zeitliche Lücke nicht.
