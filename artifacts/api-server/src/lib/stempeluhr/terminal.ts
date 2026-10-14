import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { PoolClient } from "@workspace/db";
import { can } from "../permissions";
import { audit, checkOverlap, ClockError, entry, ENTRY_SELECT, iso, settings, transaction, type Row } from "./model";

export const TERMINAL_COOKIE = "easy_clock_terminal";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieOptions = (req: Request) => ({
  httpOnly: true, sameSite: "strict" as const, path: "/",
  secure: req.secure || req.get("x-forwarded-proto")?.split(",")[0] === "https" || process.env.COOKIE_SECURE === "true",
});
function cookieToken(req: Request) {
  const raw = req.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${TERMINAL_COOKIE}=`))?.trim().slice(TERMINAL_COOKIE.length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
export const terminalResult = (t?: Row) => ({
  unlocked: !!t, id: t?.id ?? null, label: t?.label ?? null, expiresAt: t?.expires_at != null ? iso(t.expires_at) : null,
});
// Browsers limit persistent cookies. Unlimited server authorization has no expiry;
// renew its browser cookie during use, without extending time-limited authorizations.
export function terminalCookieLifetime(expiresAt: unknown) {
  return expiresAt == null ? { maxAge: 400 * 24 * 60 * 60 * 1000 } : { expires: new Date(expiresAt as string) };
}
export function renewUnlimitedCookie(req: Request, res: Response, terminal?: Row) {
  const token = cookieToken(req);
  if (terminal && terminal.expires_at == null && token)
    res.cookie(TERMINAL_COOKIE, token, { ...cookieOptions(req), ...terminalCookieLifetime(null) });
}
export async function createTerminalRecord(c: PoolClient, tokenHash: string, label: string, userId: number, hours: number | null) {
  const { rows } = await c.query(`INSERT INTO clock_terminals(token_hash,label,user_id,expires_at)
    VALUES($1,$2,$3,NOW()+$4::integer*INTERVAL '1 hour') RETURNING *`, [tokenHash, label, userId, hours]);
  return rows[0];
}
export async function activeTerminal(c: PoolClient, req: Request) {
  const token = cookieToken(req);
  if (!token) return undefined;
  const { rows } = await c.query(`SELECT t.*,u.role,u.is_active FROM clock_terminals t JOIN users u ON u.id=t.user_id
    WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>NOW())`, [hash(token)]);
  const t = rows[0];
  if (!t || !t.is_active || !(await can(t.role, "stempeluhr.terminal"))) return undefined;
  return t;
}
export async function unlock(req: Request, res: Response, label: string, userId: number, actor: string) {
  const token = randomBytes(32).toString("hex");
  const result = await transaction(async (c) => {
    const s = await settings(c);
    const oldToken = cookieToken(req);
    if (oldToken) await c.query("UPDATE clock_terminals SET revoked_at=NOW() WHERE token_hash=$1", [hash(oldToken)]);
    const terminal = await createTerminalRecord(c, hash(token), label, userId, s.terminalHours);
    await audit(c, actor, "Terminal freigeschaltet", label, null, { id: terminal.id, label, expiresAt: terminalResult(terminal).expiresAt });
    return terminal;
  });
  res.cookie(TERMINAL_COOKIE, token, { ...cookieOptions(req), ...terminalCookieLifetime(result.expires_at) });
  return terminalResult(result);
}
export async function lock(req: Request, res: Response) {
  const token = cookieToken(req);
  if (token) await transaction(async (c) => {
    const { rows } = await c.query("UPDATE clock_terminals SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id,label", [hash(token)]);
    if (rows.length) await audit(c, `Terminal ${rows[0].label}`, "Terminal gesperrt", "Am Gerät beendet", rows[0], null);
  });
  res.clearCookie(TERMINAL_COOKIE, cookieOptions(req));
}
const limits = new Map<string, { count: number; until: number }>();
function limit(key: string) {
  const now = Date.now();
  if (limits.size > 1000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
  const current = limits.get(key);
  if (!current || current.until < now) limits.set(key, { count: 1, until: now + 60000 });
  else if (++current.count > 60) throw new ClockError("Zu viele Stempelversuche. Bitte eine Minute warten.", 429);
}
export async function stamp(req: Request, card: string, requestId: string, res?: Response) {
  limit(req.ip ?? "unknown");
  return transaction(async (c) => {
    const terminal = await activeTerminal(c, req);
    if (res) renewUnlimitedCookie(req, res, terminal);
    if (!terminal) throw new ClockError("Terminal ist gesperrt oder die Freigabe abgelaufen.", 403);
    const replay = await c.query("SELECT result,card_number FROM clock_receipts WHERE terminal_id=$1 AND request_id=$2", [terminal.id, requestId]);
    if (replay.rowCount) {
      if (replay.rows[0].card_number !== card) throw new ClockError("Eine Stempelanfrage darf nicht für eine andere Karte wiederverwendet werden.", 409);
      return replay.rows[0].result;
    }
    const { rows: employees } = await c.query("SELECT * FROM clock_employees WHERE card_number=$1", [card]);
    const m = employees[0];
    if (!m || !m.active) throw new ClockError("Karte unbekannt oder Mitarbeiter nicht aktiv.", 404);
    const now = new Date();
    const s = await settings(c);
    // Includes soft-deleted rows so immediately repeating a scan remains protected.
    const last = await c.query("SELECT MAX(GREATEST(original_started_at,original_ended_at)) AS last FROM clock_entries WHERE employee_id=$1 AND source='terminal'", [m.id]);
    if (last.rows[0].last && now.getTime() - new Date(last.rows[0].last).getTime() < s.debounceSeconds * 1000)
      throw new ClockError("Diese Karte wurde gerade gestempelt. Bitte nicht doppelt scannen.", 409);
    const open = await c.query("SELECT * FROM clock_entries WHERE employee_id=$1 AND ended_at IS NULL AND deleted_at IS NULL", [m.id]);
    let id: number, action: "in" | "out";
    if (!open.rowCount) {
      await checkOverlap(c, m.id, now.toISOString(), null);
      const r = await c.query(`INSERT INTO clock_entries(employee_id,started_at,original_started_at,rules,source)
        VALUES($1,$2,$2,$3,'terminal') RETURNING id`, [m.id, now, s]);
      id = r.rows[0].id; action = "in";
    } else {
      const e = open.rows[0];
      if (now < new Date(e.started_at)) throw new ClockError("Offener Eintrag beginnt in der Zukunft. Bitte durch die Verwaltung korrigieren.", 409);
      if (now.getTime() - new Date(e.started_at).getTime() > 7 * 86400000)
        throw new ClockError("Offener Eintrag ist älter als sieben Tage. Bitte zuerst durch die Verwaltung korrigieren.", 409);
      await checkOverlap(c, m.id, iso(e.started_at), now.toISOString(), e.id);
      await c.query(`UPDATE clock_entries SET ended_at=$2,original_ended_at=COALESCE(original_ended_at,$2),updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1`, [e.id, now]);
      id = e.id; action = "out";
    }
    const r = await c.query(`${ENTRY_SELECT} WHERE e.id=$1`, [id]);
    const calculated = entry(r.rows[0]);
    const result = { action, name: `${m.first_name} ${m.last_name}`, time: now.toISOString(),
      bookedTime: action === "in" ? calculated.bookedStart : calculated.bookedEnd! };
    await audit(c, `Terminal ${terminal.label}`, action === "in" ? "Kommen" : "Gehen", `Karte ${card}`, null, { entryId: id, ...result });
    await c.query("INSERT INTO clock_receipts(terminal_id,request_id,card_number,result) VALUES($1,$2,$3,$4)", [terminal.id, requestId, card, result]);
    return result;
  });
}
