import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type Permission =
  | "pallet.create"
  | "pallet.edit"
  | "pallet.delete"
  | "shipment.create"
  | "shipment.edit"
  | "shipment.delete"
  | "shipment.lock"
  | "shipment.reschedule"
  | "austrag.create"
  | "austrag.delete"
  | "reconciliation.create"
  | "reconciliation.sign"
  | "spedition.create"
  | "spedition.edit"
  | "gefahrgut.reset"
  | "gefahrgut.assign_shipment"
  | "wareneingang.reset"
  | "kanban.use"
  | "auftrag.analyse"
  | "auftrag.analyse.spedition"
  | "push.send_custom"
  | "foto.view"
  | "foto.edit"
  | "foto.delete"
  | "knowledge.view"
  | "knowledge.edit";

export type ConfigurableRole =
  | "comet_leitstand"
  | "comet_lager"
  | "comet_viewer"
  | "speditions_admin"
  | "speditions_bearbeiter"
  | "speditions_viewer";

export const ALL_CONFIGURABLE_ROLES: ConfigurableRole[] = [
  "comet_leitstand",
  "comet_lager",
  "comet_viewer",
  "speditions_admin",
  "speditions_bearbeiter",
  "speditions_viewer",
];

export const ALL_PERMISSIONS: Permission[] = [
  "pallet.create",
  "pallet.edit",
  "pallet.delete",
  "shipment.create",
  "shipment.edit",
  "shipment.delete",
  "shipment.lock",
  "shipment.reschedule",
  "austrag.create",
  "austrag.delete",
  "reconciliation.create",
  "reconciliation.sign",
  "spedition.create",
  "spedition.edit",
  "gefahrgut.reset",
  "gefahrgut.assign_shipment",
  "wareneingang.reset",
  "kanban.use",
  "auftrag.analyse",
  "auftrag.analyse.spedition",
  "push.send_custom",
  "foto.view",
  "foto.edit",
  "foto.delete",
  "knowledge.view",
  "knowledge.edit",
];

export const PERMISSION_LABELS: Record<Permission, { label: string; category: string }> = {
  "pallet.create":        { label: "Buchung erstellen",       category: "Palettenbuchungen" },
  "pallet.edit":          { label: "Buchung bearbeiten",      category: "Palettenbuchungen" },
  "pallet.delete":        { label: "Buchung löschen",         category: "Palettenbuchungen" },
  "shipment.create":      { label: "Sendung erstellen",       category: "Verladungen" },
  "shipment.edit":        { label: "Sendung bearbeiten",      category: "Verladungen" },
  "shipment.delete":      { label: "Sendung löschen",         category: "Verladungen" },
  "shipment.lock":        { label: "Sendung sperren",         category: "Verladungen" },
  "shipment.reschedule":  { label: "Datum verschieben (DnD)", category: "Verladungen" },
  "austrag.create":       { label: "Austrag durchführen",     category: "Austragen" },
  "austrag.delete":       { label: "Austrag löschen",         category: "Austragen" },
  "reconciliation.create":{ label: "Abstimmung erstellen",    category: "Abstimmungen" },
  "reconciliation.sign":  { label: "Abstimmung unterzeichnen",category: "Abstimmungen" },
  "spedition.create":     { label: "Spedition anlegen",        category: "Speditionsverwaltung" },
  "spedition.edit":       { label: "Spedition bearbeiten",     category: "Speditionsverwaltung" },
  "gefahrgut.reset":            { label: "Checkliste zurücksetzen",       category: "Gefahrgut" },
  "gefahrgut.assign_shipment":  { label: "Checkliste LKW zuordnen",      category: "Gefahrgut" },
  "wareneingang.reset":         { label: "Protokoll löschen",             category: "Wareneingang" },
  "kanban.use":                 { label: "Kanban-Board nutzen (Drag & Drop)", category: "Kanban" },
  "auftrag.analyse":            { label: "Auftragsauswertung (CSV-Upload)",    category: "Auftragsauswertung" },
  "auftrag.analyse.spedition":  { label: "Auftragsauswertung (eigene Zeile sehen)", category: "Auftragsauswertung" },
  "push.send_custom":           { label: "Freie Nachricht senden",     category: "Benachrichtigungen" },
  "foto.view":                  { label: "Fotogalerie ansehen",        category: "Fotos" },
  "foto.edit":                  { label: "Foto bearbeiten (LKW zuordnen)", category: "Fotos" },
  "foto.delete":                { label: "Foto löschen",               category: "Fotos" },
  "knowledge.view":             { label: "Wissensdatenbank ansehen",   category: "KI-Wissensdatenbank" },
  "knowledge.edit":             { label: "Einträge erstellen / bearbeiten", category: "KI-Wissensdatenbank" },
};

export const ROLE_LABELS: Record<string, string> = {
  comet_admin:           "COMET Admin",
  comet_leitstand:       "COMET Leitstand",
  comet_lager:           "COMET Lager",
  comet_viewer:          "COMET Viewer",
  speditions_admin:      "Spedition Admin",
  speditions_bearbeiter: "Spedition Bearbeiter",
  speditions_viewer:     "Spedition Viewer",
};

// comet_admin = always all rights; not in DB
const SUPERADMIN_ROLE = "comet_admin";

// Cache: role -> permission -> allowed
let permCache: Map<string, Map<string, boolean>> | null = null;
let cacheLoading: Promise<void> | null = null;

async function loadCache(): Promise<void> {
  const rows = await db.execute(
    sql`SELECT role, permission, allowed FROM role_permissions`
  );
  const m = new Map<string, Map<string, boolean>>();
  for (const row of rows.rows as any[]) {
    if (!m.has(row.role)) m.set(row.role, new Map());
    m.get(row.role)!.set(row.permission, Boolean(row.allowed));
  }
  permCache = m;
}

export function invalidatePermissionsCache() {
  permCache = null;
  cacheLoading = null;
}

/** Ensures every role has a row for every permission (new perms default to false). */
export async function seedMissingPermissions(): Promise<void> {
  // Smart defaults must be inserted BEFORE the generic false-fallback below,
  // since both use ON CONFLICT DO NOTHING — whichever runs first "wins" the row.
  // Smart defaults: kanban.use enabled by default for lager & leitstand
  await db.execute(
    sql`INSERT INTO role_permissions (role, permission, allowed)
        SELECT role_key, 'kanban.use', true FROM roles
        WHERE role_key IN ('comet_lager', 'comet_leitstand')
        ON CONFLICT (role, permission) DO NOTHING`
  );
  // Smart defaults: auftrag.analyse.spedition enabled by default for all spedition roles
  await db.execute(
    sql`INSERT INTO role_permissions (role, permission, allowed)
        SELECT role_key, 'auftrag.analyse.spedition', true FROM roles
        WHERE role_key IN ('speditions_admin', 'speditions_bearbeiter', 'speditions_viewer')
        ON CONFLICT (role, permission) DO NOTHING`
  );
  // Smart defaults: push.send_custom enabled by default for leitstand (matches prior fixed behavior)
  await db.execute(
    sql`INSERT INTO role_permissions (role, permission, allowed)
        SELECT role_key, 'push.send_custom', true FROM roles
        WHERE role_key = 'comet_leitstand'
        ON CONFLICT (role, permission) DO NOTHING`
  );
  // Smart defaults: knowledge.view enabled by default for leitstand
  await db.execute(
    sql`INSERT INTO role_permissions (role, permission, allowed)
        SELECT role_key, 'knowledge.view', true FROM roles
        WHERE role_key = 'comet_leitstand'
        ON CONFLICT (role, permission) DO NOTHING`
  );

  for (const perm of ALL_PERMISSIONS) {
    await db.execute(
      sql`INSERT INTO role_permissions (role, permission, allowed)
          SELECT role_key, ${perm}, false FROM roles
          ON CONFLICT (role, permission) DO NOTHING`
    );
  }
}

async function ensureCache(): Promise<Map<string, Map<string, boolean>>> {
  if (permCache) return permCache;
  if (!cacheLoading) cacheLoading = loadCache();
  await cacheLoading;
  return permCache!;
}

export async function can(role: string, permission: Permission): Promise<boolean> {
  if (role === SUPERADMIN_ROLE) return true;
  const cache = await ensureCache();
  const rolemap = cache.get(role);
  if (!rolemap) return false;
  return rolemap.get(permission) ?? false;
}

export async function getRolePermissionsMatrix(): Promise<
  { role: string; permission: string; allowed: boolean }[]
> {
  const rows = await db.execute(
    sql`SELECT role, permission, allowed FROM role_permissions ORDER BY role, permission`
  );
  return (rows.rows as any[]).map((r) => ({
    role: r.role,
    permission: r.permission,
    allowed: Boolean(r.allowed),
  }));
}
