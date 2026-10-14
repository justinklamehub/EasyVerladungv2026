---
name: Unterschiedliche Zod-Fehlerklassen
description: Generierte API-Schemas und manuelle zod/v4-Schemas werfen unterschiedliche Fehlerklassen.
---

Bei gemeinsamer Verwendung generierter API-Schemas und manueller `zod/v4`-Schemas müssen API-Fehlerhandler die Fehlerklassen beider tatsächlich eingesetzten Versionen berücksichtigen.

**Why:** Die generierten Schemas nutzen den normalen `zod`-Import, der hier Version 3 liefert. Ein Handler mit ausschließlich `instanceof z.ZodError` aus `zod/v4` erkannte deren Fehler nicht; ungültige Eingaben wurden deshalb als Serverfehler statt HTTP 400 zurückgegeben.

**How to apply:** Ungültige Eingaben über den echten HTTP-Handler testen, nicht nur darauf, dass ein Parser einen Fehler wirft. Bei einer späteren Vereinheitlichung der Versionen diese Regel neu bewerten.
