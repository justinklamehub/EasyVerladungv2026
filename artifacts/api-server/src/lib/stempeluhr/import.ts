import type { PoolClient } from "@workspace/db";
import type { ClockImportInput as ImportInput } from "@workspace/api-zod";
import { audit, checkOverlap, ClockError, validateRange } from "./model";
import { DEFAULT_SETTINGS } from "./calculation";

/** Validate on a savepoint using exactly the same SQL as commit. Never overwrite old data. */
export async function importLegacy(c: PoolClient, body: ImportInput, actor: string, commit: boolean, disconnected: () => boolean = () => false) {
  if (!body.legacyTimesAcknowledged) throw new ClockError("Bitte bestätigen: Alte Zeiten sind bereits gerundet; echte Stempelzeiten lassen sich nicht wiederherstellen.");
  if (!body.employees.length && !body.entries.length) throw new ClockError("Keine Importdaten angegeben.");
  await c.query("SAVEPOINT clock_import");
  let employeesAdded = 0, entriesAdded = 0, skipped = 0;
  const deadline = Date.now() + 20000;
  const budget = () => {
    if (disconnected()) throw new ClockError("Importverbindung unterbrochen. Es wurden keine Daten übernommen.", 503);
    if (Date.now() > deadline) throw new ClockError("Import ist für eine Anfrage zu groß. Bitte kleinere Dateien bzw. Teilmengen verwenden. Es wurden keine Daten übernommen.", 503);
  };
  const errors: string[] = [];
  const employeeCards = new Set<string>(), entryIds = new Set<string>();
  // Stable order helps overlap checking and allows multiple historical records before an open record.
  for (const [idx, m] of body.employees.entries()) {
    budget();
    const card = m.cardNumber.trim();
    if (!card || !m.firstName.trim() || !m.lastName.trim()) { errors.push(`Mitarbeiter ${idx + 1}: ID und Name erforderlich.`); continue; }
    if (employeeCards.has(card)) { errors.push(`Mitarbeiter ${idx + 1}: Kartennummer doppelt in Importdatei.`); continue; }
    employeeCards.add(card);
    const existing = await c.query("SELECT * FROM clock_employees WHERE card_number=$1", [card]);
    if (existing.rowCount) {
      const e = existing.rows[0];
      if (e.first_name !== m.firstName.trim() || e.last_name !== m.lastName.trim() ||
          e.provider !== m.provider.trim() || e.activity !== m.activity.trim() || e.active !== m.active) {
        errors.push(`Mitarbeiter ${idx + 1}: Kartennummer bereits mit abweichenden Stammdaten vorhanden. Bitte vor Import klären.`);
      } else skipped++;
      continue;
    }
    await c.query(`INSERT INTO clock_employees(card_number,first_name,last_name,provider,activity,active) VALUES($1,$2,$3,$4,$5,$6)`,
      [card, m.firstName.trim(), m.lastName.trim(), m.provider.trim(), m.activity.trim(), m.active]);
    employeesAdded++;
  }
  for (const row of [...body.entries].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    budget();
    const legacyId = row.legacyId.trim();
    if (!legacyId) { errors.push("Alt-Eintrag: eindeutige ID fehlt."); continue; }
    if (entryIds.has(legacyId)) { errors.push(`Alt-Eintrag ${legacyId}: ID doppelt in Importdatei.`); continue; }
    entryIds.add(legacyId);
    const existing = await c.query("SELECT * FROM clock_entries WHERE legacy_id=$1", [legacyId]);
    if (existing.rowCount) {
      const e = existing.rows[0];
      const owner = await c.query("SELECT card_number FROM clock_employees WHERE id=$1", [e.employee_id]);
      if (new Date(e.original_started_at).getTime() !== new Date(row.startedAt).getTime() ||
        (e.original_ended_at ? new Date(e.original_ended_at).getTime() : null) !== (row.endedAt ? new Date(row.endedAt).getTime() : null) ||
        owner.rows[0]?.card_number !== row.cardNumber.trim()) {
        errors.push(`Alt-Eintrag ${legacyId}: ID ist bereits mit anderen Daten importiert.`);
      } else skipped++;
      continue;
    }
    const { rows: employees } = await c.query("SELECT * FROM clock_employees WHERE card_number=$1", [row.cardNumber.trim()]);
    if (!employees.length) { errors.push(`Alt-Eintrag ${legacyId}: Mitarbeiter-ID nicht gefunden.`); continue; }
    try {
      validateRange(row.startedAt.toISOString(), row.endedAt?.toISOString() ?? null);
      await checkOverlap(c, employees[0].id, row.startedAt.toISOString(), row.endedAt?.toISOString() ?? null);
      // Legacy data was already clipped by the PHP system. Do not clip again under today's settings.
      const legacyRules = { ...DEFAULT_SETTINGS, earliestStart: null, latestEnd: null };
      await c.query(`INSERT INTO clock_entries(employee_id,started_at,ended_at,original_started_at,original_ended_at,rules,source,legacy_id)
        VALUES($1,$2,$3,$2,$3,$4,'legacy',$5)`, [employees[0].id, row.startedAt, row.endedAt, legacyRules, legacyId]);
      entriesAdded++;
    } catch (err) {
      if (!(err instanceof ClockError)) throw err;
      errors.push(`Alt-Eintrag ${legacyId}: ${err.message}`);
    }
    if (errors.length >= 100) { errors.push("Abbruch nach 100 Fehlern. Bitte Dateien bereinigen."); break; }
  }
  budget();
  if (!commit || errors.length) await c.query("ROLLBACK TO SAVEPOINT clock_import");
  else await audit(c, actor, "Altdaten importiert", `${employeesAdded} Mitarbeiter, ${entriesAdded} Einträge, ${skipped} identische Datensätze übersprungen.`, null,
    { employeesAdded, entriesAdded, skipped });
  await c.query("RELEASE SAVEPOINT clock_import");
  return { employeesAdded, entriesAdded, skipped, errors };
}
