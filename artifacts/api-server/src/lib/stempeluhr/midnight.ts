import type { PoolClient } from "@workspace/db";
import { logger } from "../logger";
import { berlinInstant, localDay, nextDay } from "./calculation";
import { audit, entry, ENTRY_SELECT, transaction } from "./model";

export const MIDNIGHT_COMMENT = "Automatisch um 00:00 Uhr ausgestempelt";

/** Call under the module's write lock, including before processing a new scan. */
export async function closeOverdueEntries(c: PoolClient, now = new Date()) {
  const today = berlinInstant(localDay(now));
  const { rows } = await c.query(`${ENTRY_SELECT}
    WHERE e.ended_at IS NULL AND e.deleted_at IS NULL AND e.started_at < $1
    ORDER BY e.id FOR UPDATE OF e`, [today]);
  for (const old of rows) {
    // Catch up after downtime at the FIRST missed midnight, not today's midnight.
    const end = berlinInstant(nextDay(localDay(new Date(old.started_at))));
    const reason = (old.reason ?? "").split("\n").includes(MIDNIGHT_COMMENT)
      ? old.reason : old.reason ? `${old.reason}\n${MIDNIGHT_COMMENT}` : MIDNIGHT_COMMENT;
    const { rows: updated } = await c.query(`UPDATE clock_entries
      SET ended_at=$2,reason=$3,updated_at=date_trunc('milliseconds',clock_timestamp())
      WHERE id=$1 AND ended_at IS NULL AND deleted_at IS NULL RETURNING *`, [old.id, end, reason]);
    if (!updated.length) continue;
    // No actual card scan occurred: original_ended_at and the rules snapshot stay untouched.
    await audit(c, "System", "Automatisch ausgestempelt", MIDNIGHT_COMMENT,
      entry(old), entry({ ...old, ...updated[0] }));
  }
  return rows.length;
}

/** Run without a browser, retry failures, and schedule the day boundary precisely. */
export function startClockMidnightScheduler() {
  const tick = async () => {
    try {
      const count = await transaction((c) => closeOverdueEntries(c));
      if (count) logger.info({ count }, "Stempeluhr: offene Buchungen automatisch ausgestempelt");
    } catch (err) {
      logger.error({ err }, "Stempeluhr: automatische Ausstempelung fehlgeschlagen; erneuter Versuch folgt");
    } finally {
      const now = new Date();
      const untilMidnight = berlinInstant(nextDay(localDay(now))).getTime() - now.getTime();
      setTimeout(() => { void tick(); }, Math.min(30_000, Math.max(1, untilMidnight))).unref();
    }
  };
  void tick();
}
