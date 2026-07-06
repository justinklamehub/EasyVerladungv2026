---
name: COMET LKW password policy
description: Forced first-login password change, configurable expiry, real-time forced-change trigger, expiry reminder emails, and complexity rules for the comet-lkw app; also documents a dev DB schema-drift gotcha found while building it.
---

## Design
- `users` table has `must_change_password` (boolean, default false) and `password_changed_at` (timestamptz, default now()).
- A user is forced to change their password when `must_change_password` is true OR `password_changed_at` is older than 90 days. This computed value is exposed as `passwordChangeRequired` on login and `/auth/me` responses.
- Complexity policy ("normale Richtlinien"): min 8 chars, at least one uppercase, one lowercase, one digit. Enforced on every path that sets a password (self-service change/reset, admin create, admin-set-password on edit).
- Admin-created users and admin-reset passwords set `must_change_password = true`; self-service password changes clear it and reset `password_changed_at = now()`.
- Frontend redirect for forced change lives in the auth context (redirects any authenticated user with `passwordChangeRequired` to a dedicated forced-change page) plus a same check right after login response, before the dashboard redirect fires.

**Why:** Pre-existing users during the migration were backfilled with `password_changed_at = now()` and `must_change_password = false`, so they aren't retroactively forced to change passwords — only new logins/creations/resets going forward trigger the flow.

## Real-time forced-change trigger (no re-login needed)
When an admin resets a user's password (PATCH on the user), the API emits a Socket.IO event `password-changed` to a per-user room `user:${userId}` (the io instance is fetched in the route via an existing `getIO(req)` helper). The frontend `AuthContext` listens for this event and invalidates/refetches `/auth/me`; if the refreshed user has `passwordChangeRequired: true`, the existing redirect effect sends them to the forced-change page immediately — no page reload or re-login required.

**Why:** Previously the forced-change flag was only checked at login/`/auth/me`-on-mount, so a user with an open session wouldn't see the prompt until their next visit/reload.

**How to apply:** Any future flow that needs to push an immediate client-side reaction to a specific logged-in user (not a broadcast) should reuse the `user:${userId}` room convention and emit from the route after the DB write succeeds.

## Password expiry: configurable interval + reminder emails
- Expiry window is configurable via a `password_expiry_days` app setting (default 90), read through `getPasswordMaxAgeDays()/getPasswordMaxAgeMs()` instead of a hardcoded constant.
- Reminder emails are sent N days before expiry, with N being a comma-separated list of thresholds in the `password_expiry_reminder_days` setting (default `"7,3,1"`), editable in Einstellungen → Sicherheit along with the expiry-days setting and the `password_expiry` email template (subject/body support `{{username}} {{email}} {{tage}} {{ablaufdatum}}`).
- A dedicated `password_expiry_reminders` table (userId, daysThreshold, sentAt) dedupes sends via `INSERT ... ON CONFLICT DO NOTHING RETURNING` inside an hourly scheduler check (`runPasswordExpiryReminderCheck`, wired into the existing `runAllChecks()` loop) — this guarantees at-most-once delivery per (user, threshold) even if the check overlaps or reruns.
- Reminder history is cleared (`resetPasswordExpiryReminders(userId)`) whenever a password actually changes (self-service or admin-reset), so the next 90-day cycle starts clean.

**Why:** Atomic DB-level dedupe was chosen over an in-memory guard because the scheduler could restart or run on multiple instances; only the DB can guarantee exactly-once-per-threshold semantics.

**How to apply:** When manually testing reminders, backdate `password_changed_at` (e.g. `NOW() - INTERVAL '83 days'` for a 90-day/7-day-before scenario) and call the scheduler function directly rather than waiting for the hourly interval — in dev, sending will fail with `spawn sendmail ENOENT` since there's no local MTA/SMTP configured; that's expected and orthogonal to the reminder-selection logic itself.

## Gotcha: dev DB schema drift
While testing, `users.email` had a `NOT NULL` constraint in the actual Postgres dev DB even though the Drizzle schema declares it nullable (`text("email").unique()` with no `.notNull()`). This silently broke "create user without email" until fixed with a direct `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`.

**Why:** `drizzle-kit push` was previously avoided for some changes (see drizzle-push-non-interactive memory) and manual SQL patches can drift from the declared schema over time.

**How to apply:** When a DB operation fails with a NOT NULL / constraint violation that seems to contradict the Drizzle schema definition, check `information_schema.columns` directly rather than assuming the schema file is authoritative — the live DB may have drifted.
