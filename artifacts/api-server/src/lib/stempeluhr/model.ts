import { pool, type PoolClient } from "@workspace/db";
import { DEFAULT_SETTINGS, calculate, type Settings } from "./calculation";

export class ClockError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type Row = Record<string, any>;
export const iso = (date: any): string => new Date(date).toISOString();
let ensured: Promise<void> | undefined;
export function ensureClockTables(): Promise<void> {
  if (!ensured) ensured = (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(674091)");
      await c.query(`
        CREATE TABLE IF NOT EXISTS clock_employees (
          id SERIAL PRIMARY KEY, card_number TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT '', activity TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()));
        CREATE TABLE IF NOT EXISTS clock_entries (
          id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES clock_employees(id),
          started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ, original_started_at TIMESTAMPTZ NOT NULL,
          original_ended_at TIMESTAMPTZ, rules JSONB NOT NULL, pause_override INTEGER,
          source TEXT NOT NULL, legacy_id TEXT UNIQUE, deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
          CHECK (ended_at IS NULL OR ended_at >= started_at),
          CHECK (pause_override IS NULL OR pause_override BETWEEN 0 AND 1440));
        CREATE UNIQUE INDEX IF NOT EXISTS clock_one_open_entry ON clock_entries(employee_id)
          WHERE ended_at IS NULL AND deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS clock_entries_employee_time ON clock_entries(employee_id,started_at) WHERE deleted_at IS NULL;
        CREATE TABLE IF NOT EXISTS clock_card_counter (
          id INTEGER PRIMARY KEY CHECK (id=1),
          last_number INTEGER NOT NULL CHECK (last_number BETWEEN 0 AND 99999999));
        INSERT INTO clock_card_counter(id,last_number)
          VALUES(1,COALESCE((SELECT MAX(SUBSTRING(card_number FROM 2)::integer)
            FROM clock_employees WHERE card_number ~ '^M[0-9]{8}$'),
            (to_char(NOW() AT TIME ZONE 'Europe/Berlin','YY') || '000000')::integer))
          ON CONFLICT(id) DO NOTHING;
        CREATE TABLE IF NOT EXISTS clock_settings (
          id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()));
        CREATE TABLE IF NOT EXISTS clock_audit (
          id SERIAL PRIMARY KEY, action TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL,
          before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        CREATE TABLE IF NOT EXISTS clock_terminals (
          id SERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, user_id INTEGER NOT NULL,
          expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ);
        ALTER TABLE clock_terminals ALTER COLUMN expires_at DROP NOT NULL;
        CREATE TABLE IF NOT EXISTS clock_receipts (
          terminal_id INTEGER NOT NULL REFERENCES clock_terminals(id), request_id TEXT NOT NULL, card_number TEXT NOT NULL,
          result JSONB NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS clock_receipt_request ON clock_receipts(terminal_id,request_id);
        CREATE TABLE IF NOT EXISTS clock_shifts (
          id SERIAL PRIMARY KEY, data JSONB NOT NULL, deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()));
        CREATE TABLE IF NOT EXISTS clock_shift_assignments (
          id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES clock_employees(id),
          data JSONB NOT NULL, deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()));
        CREATE INDEX IF NOT EXISTS clock_shift_assignments_employee ON clock_shift_assignments(employee_id) WHERE deleted_at IS NULL;
        CREATE TABLE IF NOT EXISTS clock_shift_exceptions (
          id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES clock_employees(id),
          data JSONB NOT NULL, deleted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()));
        CREATE INDEX IF NOT EXISTS clock_shift_exceptions_employee ON clock_shift_exceptions(employee_id) WHERE deleted_at IS NULL;
      `);
      const { updatedAt: _, ...defaults } = DEFAULT_SETTINGS;
      await c.query("INSERT INTO clock_settings(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING", [defaults]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    finally { c.release(); }
  })().catch((e) => { ensured = undefined; throw e; });
  return ensured;
}
export async function read<T>(fn: (c: PoolClient) => Promise<T>) {
  await ensureClockTables();
  const c = await pool.connect();
  try { return await fn(c); } finally { c.release(); }
}
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>) {
  return read(async (c) => {
    await c.query("BEGIN");
    try {
      // All module writes use the same lock: no stamp/correction/import races.
      await c.query("SELECT pg_advisory_xact_lock(674092)");
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  });
}
export async function settings(c: PoolClient): Promise<Settings> {
  const { rows } = await c.query("SELECT * FROM clock_settings WHERE id=1");
  return { ...rows[0].data, updatedAt: iso(rows[0].updated_at) };
}
export function employee(r: Row) {
  return { id: r.id, cardNumber: r.card_number, firstName: r.first_name, lastName: r.last_name,
    provider: r.provider, activity: r.activity, active: r.active, updatedAt: iso(r.updated_at) };
}
export function entry(r: Row) {
  return {
    id: r.id, employeeId: r.employee_id, cardNumber: r.card_number, firstName: r.first_name, lastName: r.last_name,
    provider: r.provider, activity: r.activity, startedAt: iso(r.started_at), endedAt: r.ended_at ? iso(r.ended_at) : null,
    originalStartedAt: iso(r.original_started_at), originalEndedAt: r.original_ended_at ? iso(r.original_ended_at) : null,
    shiftName: r.rules.shiftWindow?.name ?? null, shiftDay: r.rules.shiftWindow?.day ?? null,
    shiftStart: r.rules.shiftWindow?.start ?? null, shiftEnd: r.rules.shiftWindow?.end ?? null,
    ...calculate(new Date(r.started_at), r.ended_at ? new Date(r.ended_at) : null, r.rules, r.pause_override),
    pauseOverride: r.pause_override, source: r.source, updatedAt: iso(r.updated_at),
  };
}
export const ENTRY_SELECT = `SELECT e.*,m.card_number,m.first_name,m.last_name,m.provider,m.activity
  FROM clock_entries e JOIN clock_employees m ON m.id=e.employee_id`;
export async function audit(c: PoolClient, actor: string, action: string, reason: string, before: unknown, after: unknown) {
  await c.query("INSERT INTO clock_audit(action,actor,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
    [action, actor, reason, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]);
}
export function checkVersion(actual: unknown, expected?: string) {
  if (!expected || iso(actual) !== expected) throw new ClockError("Der Datensatz wurde inzwischen geändert. Bitte neu laden.", 409);
}
export function validateRange(start: string, end: string | null) {
  const a = new Date(start), b = end ? new Date(end) : null;
  if (!Number.isFinite(a.getTime()) || (b && !Number.isFinite(b.getTime()))) throw new ClockError("Ungültige Zeit.");
  if (b && b < a) throw new ClockError("Gehen darf nicht vor Kommen liegen.");
  if (b && b.getTime() - a.getTime() > 7 * 86400000) throw new ClockError("Ein Eintrag darf höchstens sieben Tage umfassen.");
}
export async function checkOverlap(c: PoolClient, employeeId: number, start: string, end: string | null, exclude = 0) {
  const rows = await c.query(`SELECT id FROM clock_entries WHERE employee_id=$1 AND deleted_at IS NULL AND id<>$4
    AND started_at < COALESCE($3::timestamptz,'infinity'::timestamptz)
    AND COALESCE(ended_at,'infinity'::timestamptz) > $2::timestamptz LIMIT 1`, [employeeId, start, end, exclude]);
  if (rows.rowCount) throw new ClockError("Der Zeitraum überschneidet sich mit einem vorhandenen Eintrag.", 409);
}
