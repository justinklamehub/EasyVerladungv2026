---
name: COMET LKW custom design settings
description: How the app-wide, admin-configurable theming (Buttons/Tabellenkopf/Tabellenzeilen/Filter/Cards) is stored and applied.
---

The "Einstellungen → Design" feature stores all styling overrides as a single JSON blob under one settings key (`custom_design`), rather than one row per CSS property.

**Why:** Keeps the settings table schema stable (no migration needed per new stylable property) and makes save/reset atomic — one PUT updates the whole design in one request, and "reset to default" is just clearing the object.

**How to apply:** The JSON blob maps semantic field names (e.g. `buttonBg`, `tableHeaderFg`, `filterRadius`, `cardBorder`) to raw CSS values (colors/radii as plain strings). A hook reads this blob (fetched via the public settings endpoint) and applies each present field as an inline CSS custom property override on `document.documentElement`; missing/empty fields fall back to the values already defined in `index.css`, so partial customization never breaks the base theme. When adding a new stylable element in the future, follow this same pattern: define a CSS var with a safe default in `index.css`, consume it via Tailwind arbitrary value in the component, add a field to the JSON schema/hook, and add a control to the settings UI group — no backend schema change required since it all rides on the existing generic key/value settings store (admin-only write, public read).
