import type { PoolClient } from "@workspace/db";
import type { ClockShiftInput, ClockShiftAssignmentInput, ClockShiftExceptionInput } from "@workspace/api-zod";
import { audit, checkVersion, ClockError, employee, iso, settings, type Row } from "./model";
import { addDays, monday, plannedDay, rulesForShift, type ShiftData } from "./shift-calculation";

const TABLES = { shift: "clock_shifts", assignment: "clock_shift_assignments", exception: "clock_shift_exceptions" } as const;
export type ShiftKind = keyof typeof TABLES;
const mapped = (r: Row) => ({ ...r.data, id: r.id, updatedAt: iso(r.updated_at) });
export function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day)
    throw new ClockError("Ungültiges Datum.");
}
function period(from: string, to: string | null) {
  validDay(from); if (to != null) validDay(to);
  if (to != null && to < from) throw new ClockError("Das Ende darf nicht vor dem Beginn liegen.");
}
export async function loadShiftData(c: PoolClient): Promise<ShiftData> {
  const shifts = (await c.query("SELECT * FROM clock_shifts WHERE deleted_at IS NULL ORDER BY id")).rows.map(mapped);
  const assignments = (await c.query("SELECT * FROM clock_shift_assignments WHERE deleted_at IS NULL ORDER BY id")).rows.map(mapped);
  const exceptions = (await c.query("SELECT * FROM clock_shift_exceptions WHERE deleted_at IS NULL ORDER BY id")).rows.map(mapped);
  return { shifts, assignments, exceptions } as ShiftData;
}
export async function shiftRules(c: PoolClient, employeeId: number, start: Date) {
  return rulesForShift(await loadShiftData(c), employeeId, start, await settings(c));
}
export async function planning(c: PoolClient, from: string, to: string, employeeId?: number) {
  period(from, to);
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 61) throw new ClockError("Die Schichtvorschau ist auf 62 Tage begrenzt.");
  const data = await loadShiftData(c);
  const employees = (await c.query("SELECT * FROM clock_employees ORDER BY last_name,first_name")).rows.map(employee);
  if (employeeId != null && !employees.some((e) => e.id === employeeId)) throw new ClockError("Mitarbeiter nicht gefunden.", 404);
  const selected = employees.filter((e) => employeeId != null ? e.id === employeeId : e.active);
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1))
    for (const e of selected) days.push(plannedDay(data, e.id, day));
  return { ...data, employees, days };
}
async function validate(c: PoolClient, kind: ShiftKind, input: ClockShiftInput | ClockShiftAssignmentInput | ClockShiftExceptionInput, id?: number) {
  if (kind === "shift") {
    const b = input as ClockShiftInput;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!b.name.trim()) throw new ClockError("Schichtname ist erforderlich.");
    if (![b.startTime, b.endTime].every((s) => time.test(s))) throw new ClockError("Uhrzeiten bitte als HH:MM angeben.");
    if ([b.startTime, b.endTime].some((s) => s.startsWith("02:"))) throw new ClockError("Schichtgrenzen zwischen 02:00 und 02:59 sind wegen der Zeitumstellung nicht zulässig.");
    const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const length = (minute(b.endTime) - minute(b.startTime) + 1440) % 1440;
    if (!length) throw new ClockError("Schichtbeginn und Schichtende müssen unterschiedlich sein.");
    if (!Number.isInteger(b.pauseMinutes) || b.pauseMinutes < 0 || b.pauseMinutes >= length) throw new ClockError("Die Pause muss kürzer als die Schicht sein.");
    const duplicate = await c.query("SELECT id FROM clock_shifts WHERE deleted_at IS NULL AND lower(data->>'name')=lower($1) AND ($2::integer IS NULL OR id<>$2)", [b.name.trim(), id ?? null]);
    if (duplicate.rowCount) throw new ClockError("Eine Schicht mit diesem Namen existiert bereits.", 409);
    return { name: b.name.trim(), startTime: b.startTime, endTime: b.endTime, pauseMinutes: b.pauseMinutes };
  }
  const b = input as ClockShiftAssignmentInput | ClockShiftExceptionInput;
  period(b.startsOn, b.endsOn);
  if (!Number.isSafeInteger(b.employeeId) || b.employeeId < 1 || !(await c.query("SELECT 1 FROM clock_employees WHERE id=$1", [b.employeeId])).rowCount)
    throw new ClockError("Mitarbeiter nicht gefunden.", 404);
  if (!b.weekdays.length || b.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(b.weekdays).size !== b.weekdays.length)
    throw new ClockError("Bitte eindeutige Wochentage auswählen.");
  const refs = kind === "assignment" ? (b as ClockShiftAssignmentInput).shiftIds : [(b as ClockShiftExceptionInput).shiftId].filter((v): v is number => v != null);
  if (refs.some((v) => !Number.isSafeInteger(v) || v < 1)) throw new ClockError("Ungültige Schicht-ID.");
  if (kind === "assignment" && (!refs.length || refs.length > 12)) throw new ClockError("Der Wechsel benötigt 1 bis 12 Wochen.");
  const shifts = (await c.query("SELECT id FROM clock_shifts WHERE deleted_at IS NULL AND id=ANY($1::integer[])", [refs])).rows;
  if (refs.some((s) => !shifts.some((r) => r.id === s))) throw new ClockError("Eine ausgewählte Schicht existiert nicht mehr.", 409);
  const overlap = await c.query(`SELECT id FROM ${TABLES[kind]} WHERE deleted_at IS NULL AND employee_id=$1
    AND ($2::integer IS NULL OR id<>$2) AND data->>'startsOn'<=COALESCE($3,'9999-12-31')
    AND COALESCE(data->>'endsOn','9999-12-31')>=$4`, [b.employeeId, id ?? null, b.endsOn, b.startsOn]);
  if (overlap.rowCount) throw new ClockError(kind === "assignment"
    ? "Für diesen Mitarbeiter besteht bereits eine überlappende Schichtzuordnung. Vorhandenen Zeitraum zuerst anpassen."
    : "Für diesen Mitarbeiter besteht bereits eine Ausnahme in diesem Zeitraum.", 409);
  const base = { employeeId: b.employeeId, startsOn: b.startsOn, endsOn: b.endsOn, weekdays: [...b.weekdays].sort((a, b) => a - b) };
  return kind === "assignment"
    ? { ...base, shiftIds: (b as ClockShiftAssignmentInput).shiftIds, anchorMonday: monday(b.startsOn) }
    : { ...base, shiftId: (b as ClockShiftExceptionInput).shiftId, note: (b as ClockShiftExceptionInput).note.trim() };
}
export async function saveShift(c: PoolClient, kind: ShiftKind, input: ClockShiftInput | ClockShiftAssignmentInput | ClockShiftExceptionInput, actor: string, id?: number, version?: string) {
  const table = TABLES[kind];
  const old = id == null ? null : (await c.query(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (id != null && !old) throw new ClockError("Schichteintrag nicht gefunden.", 404);
  if (old) checkVersion(old.updated_at, version!);
  const data = await validate(c, kind, input, id);
  let r: Row;
  if (old) r = (await c.query(`UPDATE ${table} SET data=$1,${kind === "shift" ? "" : "employee_id=$3,"}
    updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+INTERVAL '1 millisecond') WHERE id=$2 RETURNING *`,
    kind === "shift" ? [data, id] : [data, id, (input as ClockShiftAssignmentInput).employeeId])).rows[0];
  else r = (await c.query(`INSERT INTO ${table}(data${kind === "shift" ? "" : ",employee_id"}) VALUES($1${kind === "shift" ? "" : ",$2"}) RETURNING *`,
    kind === "shift" ? [data] : [data, (input as ClockShiftAssignmentInput).employeeId])).rows[0];
  const result = mapped(r);
  await audit(c, actor, kind === "shift" ? "Schichtvorlage gespeichert" : kind === "assignment" ? "Schicht zugeteilt" : "Schichtausnahme gespeichert",
    "Bestehende Buchungen behalten ihren gespeicherten Regelstand.", old ? mapped(old) : null, result);
  return result;
}
export async function removeShift(c: PoolClient, kind: ShiftKind, id: number, version: string, actor: string) {
  const table = TABLES[kind];
  const old = (await c.query(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (!old) throw new ClockError("Schichteintrag nicht gefunden.", 404);
  checkVersion(old.updated_at, version);
  if (kind === "shift") {
    const used = await c.query(`SELECT id FROM clock_shift_assignments WHERE deleted_at IS NULL AND data->'shiftIds' @> $1::jsonb
      UNION ALL SELECT id FROM clock_shift_exceptions WHERE deleted_at IS NULL AND (data->>'shiftId')::integer=$2 LIMIT 1`, [JSON.stringify([id]), id]);
    if (used.rowCount) throw new ClockError("Diese Schicht wird noch zugeteilt. Erst die Zuordnungen und Ausnahmen ändern oder entfernen.", 409);
  }
  await c.query(`UPDATE ${table} SET deleted_at=now(),updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp()),updated_at+INTERVAL '1 millisecond') WHERE id=$1`, [id]);
  await audit(c, actor, "Schichteintrag entfernt", "Bestehende Zeitbuchungen bleiben erhalten.", mapped(old), null);
}
