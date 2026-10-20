import type { PoolClient } from "@workspace/db";

/** Runs inside the schema transaction/lock. Backfill once, never restore an explicitly cleared reason. */
export async function ensureEntryReasons(c: PoolClient) {
  const exists = await c.query(`SELECT 1 FROM pg_attribute
    WHERE attrelid='clock_entries'::regclass AND attname='reason' AND NOT attisdropped`);
  if (exists.rowCount) return;
  await c.query("ALTER TABLE clock_entries ADD COLUMN reason TEXT NOT NULL DEFAULT ''");
  await c.query(`WITH latest AS (
    SELECT DISTINCT ON (after_data->>'id') after_data->>'id' AS entry_id, reason
    FROM clock_audit WHERE action IN ('Zeit korrigiert','Zeit manuell angelegt') AND after_data->>'id' IS NOT NULL
      AND btrim(reason)<>''
    ORDER BY after_data->>'id',id DESC
  )
  UPDATE clock_entries e SET reason=latest.reason FROM latest WHERE e.id::text=latest.entry_id`);
}
