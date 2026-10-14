import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  GetStempeluhrStateQueryParams, GetStempeluhrStateResponse, CreateClockEmployeeBody,
  UpdateClockEmployeeBody, UpdateClockEmployeeResponse, CreateClockEntryBody,
  UpdateClockEntryBody, UpdateClockEntryResponse, DeleteClockEntryBody, GetClockSettingsResponse,
  UpdateClockSettingsBody, UpdateClockSettingsResponse, PreviewClockImportBody, PreviewClockImportResponse,
  CommitClockImportBody, CommitClockImportResponse, GetClockTerminalResponse, UnlockClockTerminalBody,
  UnlockClockTerminalResponse, StampClockTerminalBody, StampClockTerminalResponse, GetClockTerminalsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { can, type Permission } from "../lib/permissions";
import { read, transaction, audit, settings, entry, employee, checkVersion, checkOverlap, validateRange, ClockError, ENTRY_SELECT, iso } from "../lib/stempeluhr/model";
import { berlinInstant, nextDay } from "../lib/stempeluhr/calculation";
import { activeTerminal, terminalResult, unlock, lock, stamp } from "../lib/stempeluhr/terminal";
import { importLegacy } from "../lib/stempeluhr/import";

const router = Router();
const keys: Permission[] = ["stempeluhr.view", "stempeluhr.terminal", "stempeluhr.employees", "stempeluhr.correct",
  "stempeluhr.delete", "stempeluhr.export", "stempeluhr.settings", "stempeluhr.import"];
const actor = (req: Request) => req.session.username || `Benutzer ${req.session.userId}`;
const idParam = (req: Request) => z.coerce.number().int().positive().parse(req.params.id);
const nonempty = (s: string, label: string) => { const value = s.trim(); if (!value) throw new ClockError(`${label} ist erforderlich.`); return value; };
async function permissions(req: Request, required: Permission[]) {
  // Re-read current role; stale browser sessions must not retain revoked access.
  const user = await read(async (c) => (await c.query("SELECT role,is_active FROM users WHERE id=$1", [req.session.userId])).rows[0]);
  if (!user?.is_active) throw new ClockError("Anmeldung erforderlich.", 401);
  const allowed = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await can(user.role, key)])));
  if (!required.some((p) => allowed[p])) throw new ClockError("Keine Berechtigung für diese Stempeluhr-Funktion.", 403);
  return allowed;
}
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (err: any) {
      if (res.headersSent || res.destroyed) { req.log.warn("Stempeluhr response was already closed"); return; }
      if (err instanceof ClockError) { res.status(err.status).json({ error: err.message }); return; }
      if (err instanceof z.ZodError) { res.status(400).json({ error: "Ungültige Eingabe.", details: err.issues }); return; }
      if (err.code === "23505") { res.status(409).json({ error: "Kartennummer, Alt-ID oder offener Eintrag ist bereits vorhanden." }); return; }
      if (err.code === "23503") { res.status(409).json({ error: "Der Mitarbeiter hat bereits Zeiteinträge und kann nicht gelöscht werden." }); return; }
      req.log.error({ err }, "Stempeluhr request failed");
      res.status(500).json({ error: "Stempeluhr konnte nicht verarbeitet werden." });
    }
  };
}
// The device cookie only authorizes this narrow terminal API, not the normal account session.
router.use("/stempeluhr", (req, res, next) => {
  if (req.method !== "GET") {
    const site = req.get("sec-fetch-site");
    if (site === "cross-site") { res.status(403).json({ error: "Anfrage von fremder Seite nicht erlaubt." }); return; }
    const origin = req.get("origin");
    if (origin && site !== "same-origin") {
      const hosts = [req.get("host"), req.get("x-forwarded-host")?.split(",")[0]?.trim()].filter(Boolean);
      try { if (!hosts.includes(new URL(origin).host)) { res.status(403).json({ error: "Ungültiger Anfrageursprung." }); return; } }
      catch { res.status(403).json({ error: "Ungültiger Anfrageursprung." }); return; }
    }
  }
  next();
});
router.get("/stempeluhr/state", requireAuth, handler(async (req, res) => {
  const p = await permissions(req, keys);
  const raw = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const q = GetStempeluhrStateQueryParams.parse({ ...req.query, from: new Date(`${raw.from}T00:00:00Z`), to: new Date(`${raw.to}T00:00:00Z`) });
  let from: Date, to: Date;
  try { from = berlinInstant(raw.from); to = berlinInstant(nextDay(raw.to)); } catch { throw new ClockError("Ungültiger Zeitraum."); }
  if (to <= from || to.getTime() - from.getTime() > 367 * 86400000) throw new ClockError("Bitte einen Zeitraum von höchstens einem Jahr wählen.");
  if (q.employeeId !== undefined && (!Number.isSafeInteger(q.employeeId) || q.employeeId <= 0)) throw new ClockError("Ungültige Mitarbeiter-ID.");
  const result = await read(async (c) => {
    const employeesAllowed = p["stempeluhr.view"] || p["stempeluhr.employees"] || p["stempeluhr.correct"] || p["stempeluhr.export"] || p["stempeluhr.import"];
    const entriesAllowed = p["stempeluhr.view"] || p["stempeluhr.correct"] || p["stempeluhr.export"] || p["stempeluhr.delete"];
    const auditAllowed = p["stempeluhr.view"] || p["stempeluhr.correct"] || p["stempeluhr.delete"];
    const employees = employeesAllowed ? (await c.query("SELECT * FROM clock_employees ORDER BY last_name,first_name")).rows.map(employee) : [];
    const entries = entriesAllowed ? (await c.query(`${ENTRY_SELECT}
      WHERE e.deleted_at IS NULL AND e.started_at>=$1 AND e.started_at<$2
      AND ($3::integer IS NULL OR e.employee_id=$3) ORDER BY e.started_at DESC LIMIT 10001`, [from, to, q.employeeId ?? null])).rows : [];
    if (entries.length > 10000) throw new ClockError("Mehr als 10.000 Einträge. Bitte Zeitraum oder Mitarbeiterfilter einschränken.");
    const events = auditAllowed ? (await c.query(`SELECT * FROM clock_audit WHERE created_at>=$1 AND created_at<$2 ORDER BY id DESC LIMIT 500`, [from, to])).rows : [];
    return { employees, entries: entries.map(entry), audit: events.map((r) => ({
      id: r.id, action: r.action, actor: r.actor, reason: r.reason, before: r.before_data, after: r.after_data, createdAt: iso(r.created_at),
    })) };
  });
  res.json(GetStempeluhrStateResponse.parse(result));
}));
router.post("/stempeluhr/employees", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.employees"]);
  const b = CreateClockEmployeeBody.parse(req.body);
  const result = await transaction(async (c) => {
    const { rows } = await c.query(`INSERT INTO clock_employees(card_number,first_name,last_name,provider,activity,active)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [nonempty(b.cardNumber, "Karte"), nonempty(b.firstName, "Vorname"), nonempty(b.lastName, "Nachname"), b.provider.trim(), b.activity.trim(), b.active]);
    const result = employee(rows[0]);
    await audit(c, actor(req), "Mitarbeiter angelegt", result.cardNumber, null, result);
    return result;
  });
  res.status(201).json(UpdateClockEmployeeResponse.parse(result));
}));
router.put("/stempeluhr/employees/:id", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.employees"]);
  const id = idParam(req), b = UpdateClockEmployeeBody.parse(req.body);
  const result = await transaction(async (c) => {
    const current = (await c.query("SELECT * FROM clock_employees WHERE id=$1", [id])).rows[0];
    if (!current) throw new ClockError("Mitarbeiter nicht gefunden.", 404);
    checkVersion(current.updated_at, b.expectedUpdatedAt);
    if (!b.active && (await c.query("SELECT id FROM clock_entries WHERE employee_id=$1 AND ended_at IS NULL AND deleted_at IS NULL", [id])).rowCount)
      throw new ClockError("Vor der Deaktivierung bitte den offenen Zeiteintrag schließen.");
    const { rows } = await c.query(`UPDATE clock_employees SET card_number=$2,first_name=$3,last_name=$4,provider=$5,activity=$6,active=$7,
      updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1 RETURNING *`,
      [id, nonempty(b.cardNumber, "Karte"), nonempty(b.firstName, "Vorname"), nonempty(b.lastName, "Nachname"), b.provider.trim(), b.activity.trim(), b.active]);
    const result = employee(rows[0]);
    await audit(c, actor(req), "Mitarbeiter geändert", result.cardNumber, employee(current), result);
    return result;
  });
  res.json(UpdateClockEmployeeResponse.parse(result));
}));
router.delete("/stempeluhr/employees/:id", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.employees"]);
  const id = idParam(req);
  await transaction(async (c) => {
    if ((await c.query("SELECT id FROM clock_entries WHERE employee_id=$1 LIMIT 1", [id])).rowCount)
      throw new ClockError("Mitarbeiter mit Zeiteinträgen bleiben erhalten. Bitte stattdessen deaktivieren.", 409);
    const { rows } = await c.query("DELETE FROM clock_employees WHERE id=$1 RETURNING *", [id]);
    if (!rows.length) throw new ClockError("Mitarbeiter nicht gefunden.", 404);
    await audit(c, actor(req), "Mitarbeiter gelöscht", rows[0].card_number, employee(rows[0]), null);
  });
  res.sendStatus(204);
}));
async function saveEntry(req: Request, updating: boolean) {
  await permissions(req, ["stempeluhr.correct"]);
  // Require offset-bearing timestamps; never coerce null/empty into an epoch entry.
  const dates = z.object({ startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }).nullable() }).parse(req.body);
  const b = (updating ? UpdateClockEntryBody : CreateClockEntryBody).parse(req.body);
  z.number().int().positive().parse(b.employeeId);
  if (b.pauseOverride != null) z.number().int().parse(b.pauseOverride);
  const reason = nonempty(b.reason, "Begründung");
  if (reason.length < 3) throw new ClockError("Begründung muss mindestens drei Zeichen enthalten.");
  validateRange(dates.startedAt, dates.endedAt);
  const id = updating ? idParam(req) : 0;
  return transaction(async (c) => {
    const old = updating ? (await c.query(`${ENTRY_SELECT} WHERE e.id=$1 AND e.deleted_at IS NULL`, [id])).rows[0] : undefined;
    if (updating && !old) throw new ClockError("Zeiteintrag nicht gefunden.", 404);
    if (old) {
      checkVersion(old.updated_at, b.expectedUpdatedAt);
      if (old.employee_id !== b.employeeId) throw new ClockError("Der Mitarbeiter eines bestehenden Eintrags kann nicht geändert werden.");
    }
    if (!(await c.query("SELECT id FROM clock_employees WHERE id=$1", [b.employeeId])).rowCount) throw new ClockError("Mitarbeiter nicht gefunden.", 404);
    await checkOverlap(c, b.employeeId, dates.startedAt, dates.endedAt, id);
    let savedId = id;
    if (old) await c.query(`UPDATE clock_entries SET started_at=$2,ended_at=$3,pause_override=$4,
      updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1`, [id, dates.startedAt, dates.endedAt, b.pauseOverride]);
    else {
      const s = await settings(c);
      const { rows } = await c.query(`INSERT INTO clock_entries(employee_id,started_at,ended_at,original_started_at,original_ended_at,rules,pause_override,source)
        VALUES($1,$2,$3,$2,$3,$4,$5,'manual') RETURNING id`, [b.employeeId, dates.startedAt, dates.endedAt, s, b.pauseOverride]);
      savedId = rows[0].id;
    }
    const result = entry((await c.query(`${ENTRY_SELECT} WHERE e.id=$1`, [savedId])).rows[0]);
    await audit(c, actor(req), old ? "Zeit korrigiert" : "Zeit manuell angelegt", reason, old ? entry(old) : null, result);
    return result;
  });
}
router.post("/stempeluhr/entries", requireAuth, handler(async (req, res) => {
  res.status(201).json(UpdateClockEntryResponse.parse(await saveEntry(req, false)));
}));
router.put("/stempeluhr/entries/:id", requireAuth, handler(async (req, res) => {
  res.json(UpdateClockEntryResponse.parse(await saveEntry(req, true)));
}));
router.delete("/stempeluhr/entries/:id", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.delete"]);
  const id = idParam(req), b = DeleteClockEntryBody.parse(req.body), reason = b.reason.trim();
  if (reason.length < 3) throw new ClockError("Bitte eine Begründung mit mindestens drei Zeichen angeben.");
  await transaction(async (c) => {
    const old = (await c.query(`${ENTRY_SELECT} WHERE e.id=$1 AND e.deleted_at IS NULL`, [id])).rows[0];
    if (!old) throw new ClockError("Zeiteintrag nicht gefunden.", 404);
    checkVersion(old.updated_at, b.expectedUpdatedAt);
    await c.query("UPDATE clock_entries SET deleted_at=NOW(),updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1", [id]);
    await audit(c, actor(req), "Zeit storniert", reason, entry(old), null);
  });
  res.sendStatus(204);
}));
router.get("/stempeluhr/settings", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.settings"]);
  res.json(GetClockSettingsResponse.parse(await read(settings)));
}));
router.put("/stempeluhr/settings", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.settings"]);
  const b = UpdateClockSettingsBody.parse(req.body);
  for (const value of [b.earliestStart, b.latestEnd]) if (value !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new ClockError("Uhrzeiten bitte als HH:MM angeben.");
  if (b.earliestStart && b.latestEnd && b.earliestStart >= b.latestEnd) throw new ClockError("Startgrenze muss vor der Endgrenze liegen.");
  for (const n of [b.terminalHours, b.debounceSeconds, ...b.breakRules.flatMap((r) => [r.fromMinutes, r.deductionMinutes])]) z.number().int().parse(n);
  const rules = [...b.breakRules].sort((a, b) => a.fromMinutes - b.fromMinutes);
  if (rules[0].fromMinutes !== 0 || new Set(rules.map((r) => r.fromMinutes)).size !== rules.length) throw new ClockError("Pausenstufen müssen bei 0 beginnen und eindeutige Grenzen haben.");
  // Prevent a configuration that can fail calculations on DST days.
  for (const time of [b.earliestStart, b.latestEnd]) if (time?.startsWith("02:")) throw new ClockError("Zeitgrenzen zwischen 02:00 und 02:59 sind wegen der Zeitumstellung nicht zulässig.");
  const result = await transaction(async (c) => {
    const old = await settings(c);
    checkVersion(old.updatedAt, b.updatedAt);
    const { updatedAt: _, ...data } = { ...b, breakRules: rules };
    await c.query("UPDATE clock_settings SET data=$1,updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=1", [data]);
    const result = await settings(c);
    await audit(c, actor(req), "Regeln geändert", "Gilt nur für neue Zeiteinträge; vorhandene Regelstände bleiben erhalten.", old, result);
    return result;
  });
  res.json(UpdateClockSettingsResponse.parse(result));
}));
for (const commit of [false, true]) router.post(`/stempeluhr/import/${commit ? "commit" : "preview"}`, requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.import"]);
  // Strict ISO validation before generated date coercion.
  z.object({ entries: z.array(z.object({ startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }).nullable() })).max(50000) }).parse(req.body);
  const b = (commit ? CommitClockImportBody : PreviewClockImportBody).parse(req.body);
  const result = await transaction((c) => importLegacy(c, b, actor(req), commit, () => req.aborted || res.destroyed || res.headersSent));
  res.json((commit ? CommitClockImportResponse : PreviewClockImportResponse).parse(result));
}));
router.get("/stempeluhr/terminal/status", handler(async (req, res) => {
  res.json(GetClockTerminalResponse.parse(await read(async (c) => terminalResult(await activeTerminal(c, req)))));
}));
router.post("/stempeluhr/terminal/unlock", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.terminal"]);
  const b = UnlockClockTerminalBody.parse(req.body);
  res.json(UnlockClockTerminalResponse.parse(await unlock(req, res, nonempty(b.label, "Terminalname"), req.session.userId!, actor(req))));
}));
router.post("/stempeluhr/terminal/lock", handler(async (req, res) => {
  await lock(req, res); res.sendStatus(204);
}));
router.post("/stempeluhr/terminal/stamp", handler(async (req, res) => {
  const b = StampClockTerminalBody.parse(req.body);
  res.json(StampClockTerminalResponse.parse(await stamp(req, nonempty(b.cardNumber, "Karte"), b.requestId)));
}));
router.get("/stempeluhr/terminals", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.terminal"]);
  const result = await read(async (c) => (await c.query("SELECT id,label,expires_at FROM clock_terminals WHERE revoked_at IS NULL AND expires_at>NOW() ORDER BY id DESC")).rows.map(terminalResult));
  res.json(GetClockTerminalsResponse.parse(result));
}));
router.delete("/stempeluhr/terminals/:id", requireAuth, handler(async (req, res) => {
  await permissions(req, ["stempeluhr.terminal"]);
  const id = idParam(req);
  await transaction(async (c) => {
    const r = await c.query("UPDATE clock_terminals SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id,label", [id]);
    if (!r.rows.length) throw new ClockError("Terminal nicht gefunden oder bereits gesperrt.", 404);
    await audit(c, actor(req), "Terminal widerrufen", r.rows[0].label, r.rows[0], null);
  });
  res.sendStatus(204);
}));
export default router;
