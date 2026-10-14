---
name: Filterzustand bei Live-Updates
description: Neue Filterfelder müssen mit dem bereits vorhandenen Zustand geöffneter Entwicklungsansichten kompatibel sein.
---

Beim Ergänzen eines Feldes in einem React-Filterobjekt nicht voraussetzen, dass bereits geöffnete Ansichten den neuen Initialzustand bekommen. Neue Felder beim Lesen mit einem passenden Standardwert behandeln, ohne bestehende Filter zurückzusetzen.

**Why:** Fast Refresh erhält vorhandenen React-State. Eine neue Typdefinition und ein erweiterter Initialzustand ändern diesen nicht; ein direkter Zugriff auf das neue Feld kann trotz erfolgreicher Typprüfung eine geöffnete Ansicht zum Absturz bringen.

**How to apply:** Neue Filterfelder abwärtskompatibel lesen, auch in Eingabewerten, Filterzählern und Exportmetadaten. Tests sollen zusätzlich Filterobjekte ohne das neue Feld prüfen.
