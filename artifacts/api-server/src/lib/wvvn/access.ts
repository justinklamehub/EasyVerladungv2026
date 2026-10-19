import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { PoolClient } from "@workspace/db";
import { can, type Permission } from "../permissions";
import { audit, settings, WvvnError, type Row } from "./model";

const COOKIE = "comet_wvvn_device";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const options = (req: Request) => ({
  httpOnly: true, sameSite: "strict" as const, path: "/",
  secure: req.secure || req.get("x-forwarded-proto")?.split(",")[0] === "https" || process.env.COOKIE_SECURE === "true",
});
function token(req: Request) {
  const value = req.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function requirePermission(req: Request, permission: Permission) {
  if (!req.session.userId || !await can(req.session.role!, permission)) throw new WvvnError("Keine Berechtigung für diese Aktion.", 403);
}
export async function activeDevice(c: PoolClient, req: Request) {
  const t = token(req);
  if (!t) return undefined;
  const r = await c.query(`SELECT d.*,u.role,u.is_active FROM wvvn_devices d JOIN users u ON u.id=d.user_id
    WHERE token_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`, [hash(t)]);
  const d = r.rows[0];
  return d && d.is_active && await can(d.role, "wvvn.devices") && await can(d.role, "wvvn.scan") ? d : undefined;
}
export type Identity = { owner: string; actor: string; device?: Row };
export async function scannerIdentity(c: PoolClient, req: Request, res: Response, action?: "delete" | "finish"): Promise<Identity> {
  const d = await activeDevice(c, req);
  if (d) {
    if (d.expires_at == null) res.cookie(COOKIE, token(req)!, { ...options(req), maxAge: 400 * 86400000 });
    return { owner: `device:${d.id}`, actor: `Scanner ${d.label}`, device: d };
  }
  if (req.session.userId && await can(req.session.role!, "wvvn.scan")) {
    const user = (await c.query("SELECT role,is_active FROM users WHERE id=$1", [req.session.userId])).rows[0];
    if (!user?.is_active || !await can(user.role, "wvvn.scan")) throw new WvvnError("Benutzerzugang ist nicht mehr freigegeben.", 403);
    if (action) await requirePermission(req, action === "delete" ? "wvvn.delete" : "wvvn.finish");
    return { owner: `user:${req.session.userId}`, actor: req.session.username || "Benutzer" };
  }
  throw new WvvnError("Scanner ist nicht freigeschaltet oder die Freigabe ist abgelaufen.", 403);
}
export async function unlockDevice(c: PoolClient, req: Request, res: Response, label: string) {
  await requirePermission(req, "wvvn.devices");
  await requirePermission(req, "wvvn.scan");
  const old = token(req);
  const previous = old ? (await c.query("SELECT id FROM wvvn_devices WHERE token_hash=$1", [hash(old)])).rows[0] : undefined;
  const t = randomBytes(32).toString("hex");
  const s = await settings(c);
  const r = previous
    ? await c.query(`UPDATE wvvn_devices SET token_hash=$1,label=$2,user_id=$3,
        expires_at=now()+$4::integer*interval '1 hour',revoked_at=NULL WHERE id=$5 RETURNING *`,
      [hash(t), label, req.session.userId, s.deviceHours, previous.id])
    : await c.query(`INSERT INTO wvvn_devices(token_hash,label,user_id,expires_at)
        VALUES($1,$2,$3,now()+$4::integer*interval '1 hour') RETURNING *`, [hash(t), label, req.session.userId, s.deviceHours]);
  const d = r.rows[0];
  await audit(c, req.session.username!, "Scanner freigeschaltet", `#${d.id} ${label}`);
  // Keep browser identity longer than server authorization, so an explicitly
  // reauthorized device can resume its own open lists after expiry or locking.
  res.cookie(COOKIE, t, { ...options(req), maxAge: 400 * 86400000 });
  return d;
}
export async function lockDevice(c: PoolClient, req: Request, res: Response) {
  const t = token(req);
  if (t) {
    const r = await c.query("UPDATE wvvn_devices SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING *", [hash(t)]);
    if (r.rowCount) await audit(c, `Scanner ${r.rows[0].label}`, "Scanner gesperrt", `#${r.rows[0].id}`);
  }
  // Retain the revoked, useless-for-access token solely for explicit reauthorization.
  // Clearing it would orphan this device's open lists.
  if (t) res.cookie(COOKIE, t, { ...options(req), maxAge: 400 * 86400000 });
}
