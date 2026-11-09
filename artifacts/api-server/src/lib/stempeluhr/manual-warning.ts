import { createHash } from "node:crypto";
import type { PoolClient } from "@workspace/db";
import { ClockError, entry, ENTRY_SELECT, iso, type Row } from "./model";

/** Called inside the write transaction so confirmation always covers current conflicts. */
export async function confirmManualSave(c: PoolClient, input: {
  employeeId: number; startedAt: string; endedAt: string | null;
  pauseOverride: number | null; reason?: string; expectedUpdatedAt?: string; confirmation?: string;
}, id: number, old?: Row) {
  const { rows } = await c.query(`${ENTRY_SELECT}
    WHERE e.employee_id=$1 AND e.deleted_at IS NULL AND e.id<>$4
    AND ((e.started_at < COALESCE($3::timestamptz,'infinity'::timestamptz)
      AND COALESCE(e.ended_at,'infinity'::timestamptz) > $2::timestamptz)
      OR (e.started_at=$2::timestamptz AND e.ended_at IS NOT DISTINCT FROM $3::timestamptz)
      OR (e.ended_at IS NULL AND $3::timestamptz IS NULL))
    ORDER BY e.id`, [input.employeeId, input.startedAt, input.endedAt, id]);
  const stale = !!old && (!input.expectedUpdatedAt || iso(old.updated_at) !== input.expectedUpdatedAt);
  if (!rows.length && !stale) return;
  const { confirmation: _, ...values } = input;
  // Binding to data AND DB versions prevents confirming a newly changed conflict by accident.
  const confirmation = createHash("sha256").update(JSON.stringify({
    id, values, old: old ? [old.id, iso(old.updated_at)] : null,
    conflicts: rows.map((r) => [r.id, iso(r.updated_at)]),
  })).digest("hex");
  if (input.confirmation === confirmation) return;
  const message = [
    rows.length ? "Es gibt bereits doppelte, überlappende oder weitere offene Buchungen. Beim Speichern bleiben diese bestehen und Zeiten können mehrfach gezählt werden." : "",
    stale ? "Dieser Eintrag wurde inzwischen geändert, möglicherweise automatisch vom System. Deine Angaben überschreiben den aktuellen Stand." : "",
  ].filter(Boolean).join(" ");
  throw new ClockError(message, 409, {
    code: "CLOCK_ENTRY_WARNING", confirmation, conflicts: rows.map(entry), currentEntry: stale ? entry(old!) : null,
  });
}
