---
name: COMET LKW password policy
description: Forced first-login password change, 90-day expiry, and complexity rules for the comet-lkw app; also documents a dev DB schema-drift gotcha found while building it.
---

## Design
- `users` table has `must_change_password` (boolean, default false) and `password_changed_at` (timestamptz, default now()).
- A user is forced to change their password when `must_change_password` is true OR `password_changed_at` is older than 90 days. This computed value is exposed as `passwordChangeRequired` on login and `/auth/me` responses.
- Complexity policy ("normale Richtlinien"): min 8 chars, at least one uppercase, one lowercase, one digit. Enforced on every path that sets a password (self-service change/reset, admin create, admin-set-password on edit).
- Admin-created users and admin-reset passwords set `must_change_password = true`; self-service password changes clear it and reset `password_changed_at = now()`.
- Frontend redirect for forced change lives in the auth context (redirects any authenticated user with `passwordChangeRequired` to a dedicated forced-change page) plus a same check right after login response, before the dashboard redirect fires.

**Why:** Pre-existing users during the migration were backfilled with `password_changed_at = now()` and `must_change_password = false`, so they aren't retroactively forced to change passwords — only new logins/creations/resets going forward trigger the flow.

## Gotcha: dev DB schema drift
While testing, `users.email` had a `NOT NULL` constraint in the actual Postgres dev DB even though the Drizzle schema declares it nullable (`text("email").unique()` with no `.notNull()`). This silently broke "create user without email" until fixed with a direct `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`.

**Why:** `drizzle-kit push` was previously avoided for some changes (see drizzle-push-non-interactive memory) and manual SQL patches can drift from the declared schema over time.

**How to apply:** When a DB operation fails with a NOT NULL / constraint violation that seems to contradict the Drizzle schema definition, check `information_schema.columns` directly rather than assuming the schema file is authoritative — the live DB may have drifted.
