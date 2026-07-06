---
name: Silent fetch .catch(() => null) anti-pattern
description: Why swallowing fetch errors in multi-step submit flows causes silent data loss, and how to fix it.
---

When a submit flow does a primary save (e.g. create a record) followed by secondary related saves (e.g. attach uploaded files/photos to that record) via separate fetch calls, never do `fetch(...).catch(() => null)` on the secondary calls and then unconditionally show a success screen.

**Why:** On flaky networks (e.g. warehouse/kiosk devices on weak wifi), the secondary request can fail while the primary succeeds. The `.catch(() => null)` pattern hides this from both the user and any logs — the UI reports full success while the secondary data (e.g. a captured photo) is silently never persisted. This exact pattern caused a "photos aren't saving" bug report even though the upload/storage/API backend was fully functional end-to-end.

**How to apply:** Track the success/failure of each secondary request (e.g. `.then(r => r.ok).catch(() => false)`), and if any failed, surface a distinct, specific error/warning to the user (e.g. "Checklist saved, but N of M photos could not be saved") instead of collapsing all outcomes into a blanket success state.
