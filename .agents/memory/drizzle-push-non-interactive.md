---
name: drizzle-kit push non-interactive environment
description: drizzle-kit push cannot resolve column rename/retype ambiguity without a TTY; workaround for this sandbox.
---

`pnpm run push` (drizzle-kit push) throws "Interactive prompts require a TTY terminal" when the schema diff is ambiguous — e.g. dropping one column and adding another on the same table (rename or type change). drizzle-kit wants to ask "is this a rename or a drop+add?" interactively, which isn't possible in this environment.

**Why:** The agent shell has no TTY, so any drizzle-kit push that needs a column-rename/retype resolution prompt will always fail with this error, not just occasionally.

**How to apply:** When you know the intended change (e.g. confirmed via a DB query that the old column has no data worth migrating), skip `drizzle-kit push` for that specific change and apply the DDL directly with `psql "$DATABASE_URL" -c "ALTER TABLE ... DROP COLUMN ...; ALTER TABLE ... ADD COLUMN ...;"`. Keep the Drizzle schema file in sync so future `push` runs see a clean, non-ambiguous diff.
