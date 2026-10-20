import { Router, type Request, type Response } from "express";
import {
  GetWvvnStateResponse, GetWvvnScannerStateResponse, CreateWvvnSessionBody, AddWvvnItemBody,
  UpdateWvvnSettingsBody, UpdateWvvnArticleBody, UnlockWvvnScannerBody,
   PreviewWvvnImportBody, CommitWvvnImportBody, GetWvvnSessionResponse, LookupWvvnArticleResponse, UpdateWvvnSessionBody, DeleteWvvnSessionBody,
} from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { ALL_PERMISSIONS, can } from "../lib/permissions";
import { activeDevice, lockDevice, requirePermission, scannerIdentity, unlockDevice, type Identity } from "../lib/wvvn/access";
import { articles, article, audit, buildCsv, defaults, device, iso, quantityPieces, report, resolveArticle, session, sessionDetail, settings, settingsSchema, transaction, WvvnError } from "../lib/wvvn/model";
import { commitImport, prepareImport } from "../lib/wvvn/import";
import { recipients, sendReports } from "../lib/wvvn/reports";
import { checkData, records } from "../lib/einlagerung/model";
import { editCompletedSession, deleteCompletedSession } from "../lib/wvvn/edit";

const router = Router();
const actor = (req: Request) => req.session.username || "COMET";
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof WvvnError || error instanceof Error && "status" in error) {
        res.status((error as WvvnError).status || 400).json({ error: error.message }); return;
      }
      if (error && typeof error === "object" && "issues" in error) {
        res.status(400).json({ error: "Ungültige Eingabe.", details: error.issues }); return;
      }
      req.log.error({ err: error }, "WVVN request failed");
      res.status(500).json({ error: "Werksverkauf / Vernichtung konnte nicht verarbeitet werden." });
    }
  };
}
const id = (value: unknown) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new WvvnError("Ungültige ID.");
  return n;
};
const cleanCode = (value: unknown) => {
  if (typeof value !== "string") throw new WvvnError("Scan-Code fehlt.");
  const code = value.trim().replace(/\s/g, "");
  if (!code || code.length > 150) throw new WvvnError("Ungültiger Scan-Code.");
  return code;
};
async function ownOpen(c: import("@workspace/db").PoolClient, sessionId: number, who: Identity) {
  const s = (await c.query("SELECT * FROM wvvn_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows[0];
  if (!s || s.owner_key !== who.owner || s.legacy_id != null) throw new WvvnError("Keine eigene Scannerliste.", 403);
  return s;
}
async function scannerState(req: Request, res: Response, authorized?: Identity) {
  return transaction(async (c) => {
    let who: Identity;
    try { who = authorized ?? await scannerIdentity(c, req, res); }
    catch (e) {
      if (!(e instanceof WvvnError) || e.status !== 403) throw e;
      return { unlocked: false, device: null, sessions: [], autoAddEan: defaults.autoAddEan, defaultKware: defaults.defaultKware };
    }
    const s = await settings(c);
    const list = await c.query("SELECT id FROM wvvn_sessions WHERE owner_key=$1 AND status='open' AND legacy_id IS NULL ORDER BY id", [who.owner]);
    const sessions = [];
    for (const r of list.rows) sessions.push(await sessionDetail(c, r.id));
    return { unlocked: true, device: who.device ? device(who.device) : null, sessions, autoAddEan: s.autoAddEan, defaultKware: s.defaultKware };
  });
}
router.get("/wvvn/state", requireAuth, handler(async (req, res) => {
  const permissions = Object.fromEntries(await Promise.all(ALL_PERMISSIONS.filter((p) => p.startsWith("wvvn.")).map(async (p) => [p, await can(req.session.role!, p)])));
  if (!Object.values(permissions).some(Boolean)) throw new WvvnError("Keine Berechtigung für dieses Modul.", 403);
  const date = (v: unknown) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v).toISOString().slice(0, 10) !== v) throw new WvvnError("Ungültiges Datum.");
    return v;
  };
  const from = date(req.query.from), to = date(req.query.to);
  if (from && to && from > to) throw new WvvnError("Von-Datum muss vor dem Bis-Datum liegen.");
  const result = await transaction(async (c) => {
     const view = permissions["wvvn.view"] || permissions["wvvn.export"] || permissions["wvvn.edit"] || permissions["wvvn.remove"];
    const list = view ? await c.query(`SELECT s.*,count(i.id)::integer AS item_count,COALESCE(sum(i.pieces),0) AS pieces
      FROM wvvn_sessions s LEFT JOIN wvvn_items i ON i.session_id=s.id AND i.deleted_at IS NULL
       WHERE s.deleted_at IS NULL AND ($1::text IS NULL OR COALESCE(s.finished_at,s.created_at)>=($1::date::timestamp AT TIME ZONE 'Europe/Berlin'))
        AND ($2::text IS NULL OR COALESCE(s.finished_at,s.created_at)<(($2::date+1)::timestamp AT TIME ZONE 'Europe/Berlin'))
      GROUP BY s.id ORDER BY COALESCE(s.finished_at,s.created_at) DESC,s.id DESC LIMIT 301`, [from, to]) : { rows: [] };
    return {
      sessions: list.rows.slice(0, 300).map((r) => session(r)), truncated: list.rows.length > 300,
      articles: permissions["wvvn.articles"] || permissions["wvvn.scan"] || permissions["wvvn.view"] || permissions["wvvn.edit"] ? await articles(c) : [],
      reports: view || permissions["wvvn.settings"] ? (await c.query("SELECT * FROM wvvn_reports ORDER BY report_date DESC,id DESC LIMIT 200")).rows.map(report) : [],
      devices: permissions["wvvn.devices"] ? (await c.query("SELECT * FROM wvvn_devices ORDER BY id DESC LIMIT 200")).rows.map(device) : [],
      events: permissions["wvvn.view"] ? (await c.query("SELECT * FROM wvvn_events ORDER BY id DESC LIMIT 300")).rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, detail: r.detail, createdAt: iso(r.created_at) })) : [],
      settings: permissions["wvvn.settings"] ? await settings(c) : null,
    };
  });
  res.json(GetWvvnStateResponse.parse(result));
}));
router.get("/wvvn/scanner/state", handler(async (req, res) => { res.json(GetWvvnScannerStateResponse.parse(await scannerState(req, res))); }));
router.post("/wvvn/scanner/unlock", requireAuth, handler(async (req, res) => {
  const b = UnlockWvvnScannerBody.parse(req.body), label = b.label.trim();
  if (!label) throw new WvvnError("Gerätebezeichnung fehlt.");
  const d = await transaction((c) => unlockDevice(c, req, res, label));
  res.json(GetWvvnScannerStateResponse.parse(await scannerState(req, res, { owner: `device:${d.id}`, actor: `Scanner ${d.label}`, device: d })));
}));
router.post("/wvvn/scanner/lock", handler(async (req, res) => {
  await transaction((c) => lockDevice(c, req, res)); res.sendStatus(204);
}));
router.delete("/wvvn/devices/:id", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.devices");
  await transaction(async (c) => {
    const r = await c.query("UPDATE wvvn_devices SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING label", [id(req.params.id)]);
    if (!r.rowCount) throw new WvvnError("Gerät nicht gefunden.", 404);
    await audit(c, actor(req), "Scannerfreigabe widerrufen", r.rows[0].label);
  }); res.sendStatus(204);
}));
router.get("/wvvn/scanner/lookup", handler(async (req, res) => {
  const result = await transaction(async (c) => {
    const who = await scannerIdentity(c, req, res);
    const s = await ownOpen(c, id(req.query.sessionId), who);
    if (s.status !== "open") throw new WvvnError("Bitte zuerst einen offenen Vorgang auswählen.", 409);
    if (!["scan", "manual"].includes(String(req.query.inputMethod))) throw new WvvnError("Eingabeart fehlt.");
    return resolveArticle(await articles(c), cleanCode(req.query.code), req.query.inputMethod === "scan");
  }); res.json(LookupWvvnArticleResponse.parse(result));
}));
router.post("/wvvn/scanner/sessions", handler(async (req, res) => {
  const b = CreateWvvnSessionBody.parse(req.body);
  const result = await transaction(async (c) => {
    const who = await scannerIdentity(c, req, res);
    let r = await c.query("SELECT id FROM wvvn_sessions WHERE owner_key=$1 AND mode=$2 AND netto=$3 AND kware=$4 AND status='open' AND legacy_id IS NULL", [who.owner, b.mode, b.netto, b.kware]);
    if (!r.rowCount) {
      r = await c.query(`INSERT INTO wvvn_sessions(owner_key,actor,mode,netto,kware,status)
        VALUES($1,$2,$3,$4,$5,'open') RETURNING id`, [who.owner, who.actor, b.mode, b.netto, b.kware]);
      await audit(c, who.actor, "Liste angelegt", `#${r.rows[0].id} ${b.mode}, Netto=${b.netto}, K-Ware=${b.kware}`);
    }
    return sessionDetail(c, r.rows[0].id);
  }); res.json(GetWvvnSessionResponse.parse(result));
}));
router.post("/wvvn/scanner/sessions/:id/items", handler(async (req, res) => {
  const b = AddWvvnItemBody.parse(req.body), code = cleanCode(b.code), sessionId = id(req.params.id);
  const result = await transaction(async (c) => {
    const who = await scannerIdentity(c, req, res), s = await ownOpen(c, sessionId, who);
    const old = await c.query("SELECT * FROM wvvn_items WHERE session_id=$1 AND request_id=$2", [sessionId, b.requestId]);
    if (old.rowCount) {
      if (old.rows[0].scanned_code !== code || Number(old.rows[0].quantity) !== b.quantity || old.rows[0].input_method !== b.inputMethod) throw new WvvnError("Wiederholte Anfrage hat abweichende Daten.", 409);
      return sessionDetail(c, sessionId);
    }
    if (s.status !== "open") throw new WvvnError("Liste ist bereits abgeschlossen.", 409);
    const found = resolveArticle(await articles(c), code, false);
    if (b.inputMethod === "scan" && code !== found.article.number && b.quantity !== 1)
      throw new WvvnError("Ein EAN-Scan erfasst genau ein Stück, ein VE-EAN-Scan genau eine VE. Für abweichende Mengen manuelle Eingabe verwenden.");
    const pieces = quantityPieces(b.quantity, found.article.veFactor, found.unit);
    await c.query(`INSERT INTO wvvn_items(session_id,article_number,article_name,scanned_code,unit,quantity,ve_factor,pieces,request_id,input_method)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [sessionId, found.article.number, found.article.name, code, found.unit, b.quantity, found.article.veFactor, pieces, b.requestId,b.inputMethod]);
    await audit(c, who.actor, "Position erfasst", `Liste #${sessionId}, Artikel ${found.article.number}, ${b.quantity} ${found.unit} = ${pieces} Stück.`);
    return sessionDetail(c, sessionId);
  }); res.json(GetWvvnSessionResponse.parse(result));
}));
router.delete("/wvvn/scanner/sessions/:id/items/:itemId", handler(async (req, res) => {
  const sessionId = id(req.params.id), itemId = id(req.params.itemId);
  const result = await transaction(async (c) => {
    const who = await scannerIdentity(c, req, res, "delete"), s = await ownOpen(c, sessionId, who);
    if (s.status !== "open") throw new WvvnError("Abgeschlossene Listen sind unveränderlich.", 409);
    const r = await c.query("UPDATE wvvn_items SET deleted_at=now() WHERE id=$1 AND session_id=$2 AND deleted_at IS NULL RETURNING *", [itemId, sessionId]);
    if (!r.rowCount) throw new WvvnError("Position nicht gefunden.", 404);
    await audit(c, who.actor, "Position entfernt", `Liste #${sessionId}, Artikel ${r.rows[0].article_number}, ${r.rows[0].quantity} ${r.rows[0].unit}`);
    return sessionDetail(c, sessionId);
  }); res.json(GetWvvnSessionResponse.parse(result));
}));
router.post("/wvvn/scanner/sessions/:id/finalize", handler(async (req, res) => {
  const sessionId = id(req.params.id);
  const result = await transaction(async (c) => {
    const who = await scannerIdentity(c, req, res, "finish"), s = await ownOpen(c, sessionId, who);
    if (s.status === "done") return sessionDetail(c, sessionId);
    if (!(await c.query("SELECT 1 FROM wvvn_items WHERE session_id=$1 AND deleted_at IS NULL LIMIT 1", [sessionId])).rowCount) throw new WvvnError("Leere Liste kann nicht abgeschlossen werden.");
    await c.query("UPDATE wvvn_sessions SET status='done',finished_at=now() WHERE id=$1", [sessionId]);
    await audit(c, who.actor, "Liste abgeschlossen", `#${sessionId} ${s.mode}`);
    return sessionDetail(c, sessionId);
  }); res.json(GetWvvnSessionResponse.parse(result));
}));
router.get("/wvvn/sessions/:id", requireAuth, handler(async (req, res) => {
   if (!await can(req.session.role!, "wvvn.view") && !await can(req.session.role!, "wvvn.export") && !await can(req.session.role!, "wvvn.edit")) await requirePermission(req, "wvvn.remove");
  res.json(GetWvvnSessionResponse.parse(await transaction((c) => sessionDetail(c, id(req.params.id)))));
}));
router.delete("/wvvn/sessions/:id", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.remove");
  const body = DeleteWvvnSessionBody.parse(req.body);
  await transaction((c) => deleteCompletedSession(c, id(req.params.id), body, actor(req)));
  res.sendStatus(204);
}));
router.put("/wvvn/sessions/:id", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.edit");
  const body = UpdateWvvnSessionBody.parse(req.body);
  res.json(GetWvvnSessionResponse.parse(await transaction((c) => editCompletedSession(c, id(req.params.id), body, actor(req)))));
}));
router.put("/wvvn/articles/:id", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.articles");
  const b = UpdateWvvnArticleBody.parse(req.body);
  quantityPieces(1, b.veFactor, "VE");
  const result = await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(736291)");
    const all = await records(c), old = all.find((r) => r.kind === "article" && r.id === id(req.params.id));
    if (!old) throw new WvvnError("Artikel nicht gefunden.", 404);
    if (old.updatedAt !== b.expectedUpdatedAt) throw new WvvnError("Artikel wurde inzwischen geändert. Bitte neu laden.", 409);
    const data = checkData("article", { ...old.data, ...b }, all, old.id);
    // Preserve provenance without exposing it as editable client input.
    if (old.data.wvvnLegacy) data.wvvnLegacy = old.data.wvvnLegacy;
    const r = await c.query("UPDATE einlagerung_records SET data=$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING *", [JSON.stringify(data), old.id]);
    await audit(c, actor(req), "Gemeinsamen Artikel geändert", `${data.number}: ${JSON.stringify(old.data)} → ${JSON.stringify(data)}`);
    return article(r.rows[0]);
  }); res.json(result);
}));
router.put("/wvvn/settings", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.settings");
  const b = settingsSchema.parse(UpdateWvvnSettingsBody.parse(req.body));
  const sales = recipients(b.salesRecipients), destruction = recipients(b.destructionRecipients);
  if (b.mailEnabled && (!sales.length || !destruction.length)) throw new WvvnError("Für beide Vorgangsarten Empfänger hinterlegen, bevor der automatische Versand aktiviert wird.");
  await transaction(async (c) => {
    await c.query(`INSERT INTO settings(key,value) VALUES('wvvn_settings',$1)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(b)]);
    await audit(c, actor(req), "Moduleinstellungen geändert", "Scannerregeln und Berichtsversand aktualisiert.");
  }); res.json(b);
}));
router.post("/wvvn/import/preview", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.import");
  const b = PreviewWvvnImportBody.parse(req.body);
  res.json(await transaction(async (c) => (await prepareImport(c, b.sql)).preview));
}));
router.post("/wvvn/import/commit", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.import");
  const b = CommitWvvnImportBody.parse(req.body);
  res.json(await transaction((c) => commitImport(c, b.sql, b.previewHash, actor(req))));
}));
router.post("/wvvn/reports/send", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.settings"); res.json(await sendReports(true, actor(req)));
}));
router.get("/wvvn/sessions/:id/csv", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.export");
  const csv = await transaction(async (c) => {
    await sessionDetail(c, id(req.params.id));
    const r = await c.query(`SELECT i.*,s.netto,s.kware FROM wvvn_items i JOIN wvvn_sessions s ON s.id=i.session_id
      WHERE s.id=$1 AND i.deleted_at IS NULL ORDER BY i.id`, [id(req.params.id)]);
    return buildCsv(r.rows);
  });
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="WVVN_Liste_${id(req.params.id)}.csv"` }).send(csv);
}));
router.get("/wvvn/reports/:id/csv", requireAuth, handler(async (req, res) => {
  await requirePermission(req, "wvvn.export");
  const r = await pool.query("SELECT * FROM wvvn_reports WHERE id=$1", [id(req.params.id)]);
  if (!r.rowCount) throw new WvvnError("Bericht nicht gefunden.", 404);
  if (!r.rows[0].csv) throw new WvvnError("Für diesen Altbericht liegt keine CSV-Datei vor.", 404);
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="WVVN_Bericht_${id(req.params.id)}.csv"` }).send(r.rows[0].csv);
}));
export default router;
