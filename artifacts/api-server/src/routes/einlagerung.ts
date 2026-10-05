import { Router, type Request, type Response } from "express";
import {
  GetEinlagerungStateResponse, CreateEinlagerungRecordBody, UpdateEinlagerungRecordBody,
  UpdateEinlagerungRecordResponse, SearchEinlagerungQueryParams, SearchEinlagerungResponse,
  SetEinlagerungShelfStatusBody, SetEinlagerungShelfStatusResponse, UpdateEinlagerungSettingsResponse,
  PreviewEinlagerungImportResponse, CommitEinlagerungImportResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { can, type Permission } from "../lib/permissions";
import { checkData, dataset, event, getSettings, read, record, records, schemas, settingsSchema, transaction, WarehouseError } from "../lib/einlagerung/model";
import { commitImport, importSchema, prepareImport } from "../lib/einlagerung/import";
import { loadWarehouse, occupancy, search } from "../lib/einlagerung/search";

const router = Router();
const manage: Permission[] = ["einlagerung.view", "einlagerung.scan", "einlagerung.strategy", "einlagerung.master",
  "einlagerung.reservation.create", "einlagerung.reservation.edit", "einlagerung.import", "einlagerung.settings"];
async function permission(req: Request, permissions: Permission[]) {
  for (const p of permissions) if (await can(req.session.role!, p)) return;
  throw new WarehouseError("Keine Berechtigung für diese Aktion.", 403);
}
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (err) {
      if (err instanceof WarehouseError) { res.status(err.status).json({ error: err.message }); return; }
      if (err && typeof err === "object" && "issues" in err) {
        res.status(400).json({ error: "Ungültige Eingabe.", details: (err as any).issues }); return;
      }
      req.log.error({ err }, "Einlagerung request failed");
      res.status(500).json({ error: "Einlagerung konnte nicht verarbeitet werden." });
    }
  };
}
const kindParam = (req: Request) => {
  const kind = String(req.params.kind);
  if (!Object.hasOwn(schemas, kind)) throw new WarehouseError("Unbekannter Datentyp.");
  return kind;
};
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new WarehouseError("Ungültige ID.");
  return id;
};
function requiredPermission(kind: string, creating: boolean): Permission {
  return kind === "rule" ? "einlagerung.strategy" : kind === "reservation" ?
    (creating ? "einlagerung.reservation.create" : "einlagerung.reservation.edit") : "einlagerung.master";
}
router.get("/einlagerung/state", requireAuth, handler(async (req, res) => {
  await permission(req, manage);
  const result = await read(async (client) => {
    const { all, latest } = await loadWarehouse(client);
    const history = await client.query("SELECT id,type,filename,row_count,imported_by,imported_at FROM einlagerung_datasets ORDER BY id DESC LIMIT 50");
    const events = await client.query("SELECT * FROM einlagerung_events ORDER BY id DESC LIMIT 1000");
    const speditionen = await client.query("SELECT id,name FROM speditionen ORDER BY name");
    const datasets = [...new Map([...history.rows, ...latest].map((s) => [s.id, dataset(s)])).values()];
    return { records: all, datasets, settings: await getSettings(client), occupancy: occupancy(latest),
      events: events.rows.map((e) => ({ id: e.id, action: e.action, username: e.username, detail: e.detail, createdAt: new Date(e.created_at).toISOString() })),
      speditionen: speditionen.rows };
  });
  res.json(GetEinlagerungStateResponse.parse(result));
}));
router.post("/einlagerung/records/:kind", requireAuth, handler(async (req, res) => {
  const kind = kindParam(req);
  await permission(req, [requiredPermission(kind, true)]);
  const body = CreateEinlagerungRecordBody.parse(req.body);
  const row = await transaction(async (client) => {
    const all = await records(client);
    const data = checkData(kind, body.data, all);
    if (["reservation", "carrier"].includes(kind) && data.speditionId != null) {
      if (!(await client.query("SELECT id FROM speditionen WHERE id=$1", [data.speditionId])).rowCount)
        throw new WarehouseError("Spedition wurde nicht gefunden.");
    }
    if (kind === "shelf") Object.assign(data, { full: false, fullNote: "", fullAt: null });
    const result = await client.query("INSERT INTO einlagerung_records (kind,data) VALUES ($1,$2) RETURNING *", [kind, JSON.stringify(data)]);
    await event(client, req.session.username, "Angelegt", `${kind}: ${data.name || data.number || `#${result.rows[0].id}`}`);
    return record(result.rows[0]);
  });
  res.status(201).json(UpdateEinlagerungRecordResponse.parse(row));
}));
router.put("/einlagerung/records/:kind/:id", requireAuth, handler(async (req, res) => {
  const kind = kindParam(req), id = idParam(req);
  await permission(req, [requiredPermission(kind, false)]);
  const body = UpdateEinlagerungRecordBody.parse(req.body);
  const row = await transaction(async (client) => {
    const all = await records(client);
    const existing = all.find((r) => r.id === id && r.kind === kind);
    if (!existing) throw new WarehouseError("Datensatz wurde nicht gefunden.", 404);
    if (body.expectedUpdatedAt && body.expectedUpdatedAt !== existing.updatedAt)
      throw new WarehouseError("Der Datensatz wurde inzwischen geändert. Bitte neu laden.", 409);
    const data = checkData(kind, body.data, all, id);
    if (["reservation", "carrier"].includes(kind) && data.speditionId != null &&
      !(await client.query("SELECT id FROM speditionen WHERE id=$1", [data.speditionId])).rowCount)
      throw new WarehouseError("Spedition wurde nicht gefunden.");
    if (kind === "shelf") {
      Object.assign(data, { full: existing.data.full, fullNote: existing.data.fullNote, fullAt: existing.data.fullAt });
      if (data.name !== existing.data.name) {
        const { latest } = await loadWarehouse(client);
        if (latest.some((s) => s.rows.some((r: any) => (r.lagerplatz || r.platz) === existing.data.name)))
          throw new WarehouseError("Regal mit importiertem Bestand darf nicht umbenannt werden. Zuerst Datenstand bereinigen.");
      }
    }
    const result = await client.query("UPDATE einlagerung_records SET data=$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING *", [JSON.stringify(data), id]);
    await event(client, req.session.username, "Geändert", `${kind} #${id}: ${JSON.stringify(existing.data)} → ${JSON.stringify(data)}`);
    return record(result.rows[0]);
  });
  res.json(UpdateEinlagerungRecordResponse.parse(row));
}));
router.delete("/einlagerung/records/:kind/:id", requireAuth, handler(async (req, res) => {
  const kind = kindParam(req), id = idParam(req);
  await permission(req, [requiredPermission(kind, false)]);
  await transaction(async (client) => {
    const all = await records(client);
    const existing = all.find((r) => r.id === id && r.kind === kind);
    if (!existing) throw new WarehouseError("Datensatz wurde nicht gefunden.", 404);
    const key = ({ hall: "hallId", aisle: "aisleId", shelf: "shelfId", article: "articleId", group: "groupId" } as Record<string, string>)[kind];
    if (key && all.some((r) => r.id !== id && r.data[key] === id))
      throw new WarehouseError("Datensatz wird noch verwendet. Bitte deaktivieren oder Zuordnungen vorher entfernen.");
    if (kind === "shelf") {
      const { latest } = await loadWarehouse(client);
      if (latest.some((s) => s.rows.some((r: any) => (r.lagerplatz || r.platz || r.regal) === existing.data.name)))
        throw new WarehouseError("Regal wird im aktuellen Importstand verwendet.");
    }
    await client.query("DELETE FROM einlagerung_records WHERE id=$1", [id]);
    await event(client, req.session.username, "Gelöscht", `${kind} #${id}: ${JSON.stringify(existing.data)}`);
  });
  res.json({ ok: true });
}));
router.get("/einlagerung/search", requireAuth, handler(async (req, res) => {
  const query = SearchEinlagerungQueryParams.parse(req.query);
  await permission(req, query.mode === "artikel" ? ["einlagerung.scan", "einlagerung.view"]
    : query.mode === "auftraege" ? ["einlagerung.view", "einlagerung.scan", "einlagerung.reservation.create", "einlagerung.reservation.edit"]
    : ["einlagerung.view"]);
  res.json(SearchEinlagerungResponse.parse(await read((client) => search(client, query))));
}));
router.post("/einlagerung/shelves/:id/status", requireAuth, handler(async (req, res) => {
  const id = idParam(req), body = SetEinlagerungShelfStatusBody.parse(req.body);
  await permission(req, [body.full ? "einlagerung.full" : "einlagerung.release"]);
  if ((body.note?.length ?? 0) > 2000) throw new WarehouseError("Bemerkung ist zu lang.");
  const row = await transaction(async (client) => {
    const existing = (await records(client)).find((r) => r.id === id && r.kind === "shelf");
    if (!existing) throw new WarehouseError("Regal wurde nicht gefunden.", 404);
    const data = { ...existing.data, full: body.full, fullNote: body.full ? body.note || "" : "", fullAt: body.full ? new Date().toISOString() : null };
    const result = await client.query("UPDATE einlagerung_records SET data=$1,updated_at=clock_timestamp() WHERE id=$2 RETURNING *", [JSON.stringify(data), id]);
    await event(client, req.session.username, body.full ? "Regal voll gemeldet" : "Regal freigegeben", `${existing.data.name}: ${body.note || ""}`);
    return record(result.rows[0]);
  });
  res.json(SetEinlagerungShelfStatusResponse.parse(row));
}));
router.put("/einlagerung/settings", requireAuth, handler(async (req, res) => {
  await permission(req, ["einlagerung.settings"]);
  const body = await transaction(async (client) => {
    // Keep saved colors when an older client sends only the original fields.
    const next = settingsSchema.parse({ ...(await getSettings(client)), ...req.body });
    await client.query("INSERT INTO settings (key,value) VALUES ('einlagerung_settings',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [JSON.stringify(next)]);
    await event(client, req.session.username, "Einstellungen geändert", JSON.stringify(next));
    return next;
  });
  res.json(UpdateEinlagerungSettingsResponse.parse(body));
}));
router.post("/einlagerung/import/preview", requireAuth, handler(async (req, res) => {
  await permission(req, ["einlagerung.import"]);
  const input = importSchema.parse(req.body);
  const result = await read((client) => prepareImport(client, input));
  res.json(PreviewEinlagerungImportResponse.parse(result.preview));
}));
router.post("/einlagerung/import/commit", requireAuth, handler(async (req, res) => {
  await permission(req, ["einlagerung.import"]);
  const input = importSchema.parse(req.body);
  if (input.mode === "replace") await permission(req, ["einlagerung.replace"]);
  if (input.type === "strategie") await permission(req, ["einlagerung.strategy"]);
  if (input.type === "artikel") await permission(req, ["einlagerung.master"]);
  const result = await transaction((client) => commitImport(client, input, req.session.username || `Benutzer #${req.session.userId}`));
  res.json(CommitEinlagerungImportResponse.parse(result));
}));
export default router;
