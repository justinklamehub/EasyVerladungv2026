---
name: COMET LKW permission refactor pattern
description: How action guards vs. data-scope checks are separated in the COMET LKW frontend.
---

## Rule
Action-based guards (can a user CREATE / EDIT / DELETE / LOCK?) must use the configurable permission system via `usePermissions()`. Role-based checks are only valid for **data-scope** decisions (which records the user can see).

**Why:** The Berechtigungen admin page writes to `role_permissions` table; the backend `can(role, permission)` reads from it. Frontend guards must mirror this or the toggle has no effect in the UI.

## How to apply

- Import: `import { usePermissions } from "@/hooks/use-permissions";`
- Call once per component: `const permissions = usePermissions();`
- Derive booleans: `const canEdit = !!permissions["shipment.edit"];`
- Query key is `["my-permissions"]`, staleTime 60s — all pages share the same cache.

## Scope checks that STAY as role checks
- `isCometUser = ["comet_admin", "comet_leitstand", "comet_lager"].includes(role)` — controls which speditions are visible; spedition users only see their own data.
- `isCometAdmin = ["comet_admin", "comet_leitstand"].includes(role)` — controls COMET-side fields in the Abstimmung detail (cometBalance input, status selector).
- `isCometUser` in the shipment drawer for ATA / Tor / Status fields — COMET-only data fields, not a configurable action.
- `enabled: isCometUser` on data queries — determines which tabs/sections load data.

## Permission keys in use
- `shipment.create / edit / delete / lock / reschedule`
- `pallet.create / edit / delete`
- `austrag.create / delete`
- `reconciliation.create / sign`
- `spedition.create / edit`
- `gefahrgut.reset / assign_shipment`
- `kanban.use`

## Files updated
- `src/hooks/use-permissions.ts` — the shared hook
- `shipments/index.tsx`, `shipments/components/shipment-drawer.tsx`
- `paletten/index.tsx`
- `gefahrgut/index.tsx` (unified two separate queries into one)
- `abstimmungen/index.tsx` (both ReconciliationDetail and AbstimmungenPage)
- `shipments/kanban.tsx` (standardized query key, removed inline query)
