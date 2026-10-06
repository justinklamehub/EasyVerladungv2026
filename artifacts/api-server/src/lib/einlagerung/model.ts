import { z } from "zod/v4";
import { pool, type PoolClient } from "@workspace/db";
import { calendarWeek } from "./calendar";

export type Client = PoolClient;
export type Data = Record<string, any>;
export type WarehouseRecord = { id: number; kind: string; data: Data; updatedAt: string };
export class WarehouseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const name = z.string().trim().min(1).max(150);
const text = z.string().max(2000).default("");
const id = z.coerce.number().int().positive();
const order = z.coerce.number().int().min(0).max(100000).default(0);
const active = z.boolean().default(true);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b");
const tileColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const schemas: Record<string, z.ZodType<any>> = {
  hall: z.object({ name, sort: order, active }),
  aisle: z.object({ name, hallId: id, sort: order, active }),
  shelf: z.object({ name, aisleId: id, position: order, sort: order, active }),
  article: z.object({ number: name, ean: z.string().trim().max(100).default(""), name: z.string().max(255).default(""), active }),
  group: z.object({ name, color, active }),
  rule: z.object({ articleId: id, shelfId: id, groupId: id.nullable().optional().default(null), priority: z.coerce.number().int().min(1).max(9999), note: text, active }),
  reservation: z.object({ shelfId: id, carrierId: id.nullable().default(null), speditionId: id.nullable().default(null),
    speditionName: z.string().trim().max(150).default(""), relation: z.string().trim().max(150).default(""),
    termin: name.refine((v) => !!calendarWeek(v), "Bitte ein gültiges Datum oder KW.Jahr angeben."),
    plusKw: z.coerce.string().max(30).default(""), note: text,
    status: z.enum(["offen", "erledigt", "storniert"]).default("offen") })
    .refine((d) => d.carrierId || d.speditionId || d.speditionName, "Spedition fehlt."),
  carrier: z.object({ name, number: z.string().max(100).default(""), speditionId: id.nullable().default(null), color, textColor: color.default("#ffffff"), active }),
};
export const deadlineThresholdsSchema = z.object({
  criticalDays: z.number().int().min(0).max(3650),
  soonDays: z.number().int().min(1).max(3650),
  upcomingDays: z.number().int().min(2).max(3650),
}).refine((d) => d.criticalDays < d.soonDays && d.soonDays < d.upcomingDays,
  "Tagesgrenzen müssen aufsteigend sein: kritisch < bald fällig < demnächst.");

export const settingsSchema = z.object({
  deadlineThresholds: deadlineThresholdsSchema.default({ criticalDays: 2, soonDays: 7, upcomingDays: 14 }),
  hideFull: z.boolean(), staleHours: z.number().int().min(1).max(8760),
  colors: z.object({ free: tileColor, occupied: tileColor, full: tileColor })
    .default({ free: "#f8fafc", occupied: "#ffffff", full: "#fef2f2" }),
  profiles: z.record(z.string(), z.record(z.string(), z.number().int().min(0).max(100)))
    .refine((p) => Object.keys(p).every((k) => ["strategie", "istbestand", "retouren", "auftraege", "artikel"].includes(k)), "Unbekanntes Importprofil").default({}),
});
export const defaults: z.infer<typeof settingsSchema> = { hideFull: false, staleHours: 24, profiles: {},
  deadlineThresholds: { criticalDays: 2, soonDays: 7, upcomingDays: 14 },
  colors: { free: "#f8fafc", occupied: "#ffffff", full: "#fef2f2" } };

// Match the schema on existing/self-hosted installations without touching
// any pallet, ownership, shipment or other application tables.
export async function ensureWarehouseTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS einlagerung_records (
      id SERIAL PRIMARY KEY, kind TEXT NOT NULL, data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS einlagerung_records_kind_idx ON einlagerung_records(kind);
    CREATE TABLE IF NOT EXISTS einlagerung_datasets (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, filename TEXT NOT NULL,
      rows JSONB NOT NULL, row_count INTEGER NOT NULL, imported_by TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS einlagerung_datasets_type_idx ON einlagerung_datasets(type);
    CREATE TABLE IF NOT EXISTS einlagerung_events (
      id SERIAL PRIMARY KEY, action TEXT NOT NULL, username TEXT NOT NULL,
      detail TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export function record(row: any): WarehouseRecord {
  return { id: row.id, kind: row.kind, data: row.data, updatedAt: new Date(row.updated_at).toISOString() };
}
export async function records(client: Client) {
  const result = await client.query("SELECT * FROM einlagerung_records ORDER BY id");
  return result.rows.map(record);
}
export async function getSettings(client: Client) {
  const { rows } = await client.query("SELECT value FROM settings WHERE key = 'einlagerung_settings'");
  return rows[0] ? settingsSchema.parse(JSON.parse(rows[0].value)) : defaults;
}
export async function event(client: Client, username: string | undefined, action: string, detail: string) {
  await client.query("INSERT INTO einlagerung_events (username, action, detail) VALUES ($1,$2,$3)", [username || "COMET", action, detail]);
}
export async function transaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize strategy/master/import/status writes to prevent reference races.
    await client.query("SELECT pg_advisory_xact_lock(736291)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { client.release(); }
}
export async function read<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { client.release(); }
}
export function checkData(kind: string, input: unknown, all: WarehouseRecord[], currentId?: number): Data {
  if (!Object.hasOwn(schemas, kind)) throw new WarehouseError("Unbekannter Datentyp.");
  const schema = schemas[kind]!;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new WarehouseError(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
  const data = parsed.data;
  const ref = (key: string, target: string) => {
    if (data[key] != null && !all.some((r) => r.kind === target && r.id === data[key] && r.data.active !== false))
      throw new WarehouseError(`Ungültige oder inaktive Referenz: ${key}.`);
  };
  if (kind === "aisle") ref("hallId", "hall");
  if (kind === "shelf") ref("aisleId", "aisle");
  if (kind === "rule") { ref("articleId", "article"); ref("shelfId", "shelf"); ref("groupId", "group"); }
  if (kind === "reservation") {
    ref("shelfId", "shelf"); ref("carrierId", "carrier");
    const carrier = all.find((r) => r.kind === "carrier" && r.id === data.carrierId);
    if (carrier) { data.speditionName = carrier.data.name; data.speditionId = carrier.data.speditionId; }
  }
  const same = all.filter((r) => r.kind === kind && r.id !== currentId);
  if (kind === "rule") {
    if (data.active && same.some((r) => r.data.active !== false && r.data.articleId === data.articleId && r.data.shelfId === data.shelfId))
      throw new WarehouseError("Artikel und Regal sind bereits zugeordnet.");
  } else if (kind === "article") {
    if (same.some((r) => r.data.number === data.number || (data.ean && r.data.ean === data.ean) ||
      (data.ean && r.data.number === data.ean) || (r.data.ean && r.data.ean === data.number)))
      throw new WarehouseError("Artikelnummer oder EAN ist bereits vergeben.");
  } else if (["hall", "aisle", "shelf", "group", "carrier"].includes(kind)) {
    if (same.some((r) => r.data.name.toLowerCase() === data.name.toLowerCase()))
      throw new WarehouseError("Dieser Name ist bereits vergeben.");
    if (kind === "carrier" && data.number && same.some((r) => r.data.number === data.number))
      throw new WarehouseError("Speditionsnummer ist bereits zugeordnet.");
  }
  return data;
}
export function isShelfActive(shelf: WarehouseRecord, all: WarehouseRecord[]) {
  const aisle = all.find((r) => r.kind === "aisle" && r.id === shelf.data.aisleId);
  const hall = all.find((r) => r.kind === "hall" && r.id === aisle?.data.hallId);
  return shelf.data.active !== false && aisle?.data.active !== false && hall?.data.active !== false && !!aisle && !!hall;
}
export function dataset(row: any) {
  return { id: row.id, type: row.type, filename: row.filename, rowCount: row.row_count,
    importedAt: new Date(row.imported_at).toISOString(), importedBy: row.imported_by };
}
export async function snapshots(client: Client) {
  const { rows } = await client.query("SELECT DISTINCT ON (type) * FROM einlagerung_datasets WHERE type IN ('istbestand','retouren','auftraege','artikel','strategie') ORDER BY type, id DESC");
  return rows;
}
export function aggregateStock(rows: Data[], type: string, all: WarehouseRecord[], groupByDelivery = false): Data[] {
  const groups = new Map<string, Data>();
  const carriers = all.filter((r) => r.kind === "carrier" && r.data.active);
  for (const row of rows) {
    const shelf = type === "istbestand" ? row.lagerplatz : row.platz;
    const carrier = carriers.find((r) => (row.spediteur && r.data.number === row.spediteur) || r.data.name === row.spediteur_name1);
    const speditionId = carrier?.data.speditionId ?? null;
    const spedition = row.spediteur_name1 || row.spediteur || "";
    const deliveryNumber = [row.beleg, row.verkaufsbeleg]
      .map((value) => String(value ?? "").trim()).find((value) => /^8\d+$/.test(value)) || "";
    const keyParts = type === "istbestand" ? [shelf, row.material]
      : type === "retouren" ? [shelf, row.parcours || row.name]
      : [shelf, speditionId || spedition, row.relation, row.lfdat, row.plus_kw];
    if (type === "auftraege" && groupByDelivery) keyParts.push(deliveryNumber);
    const key = JSON.stringify(keyParts);
    const unit = type === "istbestand" ? row.lagereinh : type === "retouren" ? row.hu : row.handling_unit;
    let group = groups.get(key);
    if (!group) {
      group = { shelf, material: row.material || "", kunde: row.parcours || row.name || "", spedition,
        speditionId, relation: row.relation || "", termin: row.lfdat || "", calendarWeek: calendarWeek(row.lfdat),
        plusKw: row.plus_kw || "", units: new Set<string>(), belege: new Set<string>() };
      if (type === "auftraege" && groupByDelivery) group.deliveryNumber = deliveryNumber;
      groups.set(key, group);
    }
    group.units.add(unit);
    if (row.beleg) group.belege.add(row.beleg);
    if (row.verkaufsbeleg) group.belege.add(row.verkaufsbeleg);
  }
  return [...groups.values()].map(({ units, belege, ...g }) => ({ ...g, paletten: units.size, hus: [...units], belege: [...belege] }));
}
