import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type Permission =
  | "wvvn.view"
  | "wvvn.scan"
  | "wvvn.finish"
  | "wvvn.delete"
  | "wvvn.devices"
  | "wvvn.articles"
  | "wvvn.export"
  | "wvvn.settings"
  | "wvvn.import"
  | "stempeluhr.view"
  | "stempeluhr.terminal"
  | "stempeluhr.employees"
  | "stempeluhr.correct"
  | "stempeluhr.delete"
  | "stempeluhr.export"
  | "stempeluhr.settings"
  | "stempeluhr.import"
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
  | "knowledge.edit"
  | "einlagerung.view"
  | "einlagerung.scan"
  | "einlagerung.full"
  | "einlagerung.release"
  | "einlagerung.reservation.create"
  | "einlagerung.reservation.edit"
  | "einlagerung.strategy"
  | "einlagerung.master"
  | "einlagerung.import"
  | "einlagerung.replace"
  | "einlagerung.settings"
  | "system.view"
  | "system.update"
  | "system.liveview"
  | "system.liveview.control"
  | "system.liveview.manage";

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
  "wvvn.view", "wvvn.scan", "wvvn.finish", "wvvn.delete", "wvvn.devices",
  "wvvn.articles", "wvvn.export", "wvvn.settings", "wvvn.import",
  "stempeluhr.view", "stempeluhr.terminal", "stempeluhr.employees", "stempeluhr.correct",
  "stempeluhr.delete", "stempeluhr.export", "stempeluhr.settings", "stempeluhr.import",
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
  "einlagerung.view",
  "einlagerung.scan",
  "einlagerung.full",
  "einlagerung.release",
  "einlagerung.reservation.create",
  "einlagerung.reservation.edit",
  "einlagerung.strategy",
  "einlagerung.master",
  "einlagerung.import",
  "einlagerung.replace",
  "einlagerung.settings",
  "system.view",
  "system.update",
  "system.liveview",
  "system.liveview.control",
  "system.liveview.manage",
];

export const PERMISSION_LABELS: Record<Permission, { label: string; category: string }> = {
  "wvvn.view": { label: "Listen, Berichte und Protokoll ansehen", category: "Werksverkauf / Vernichtung" },
  "wvvn.scan": { label: "Artikel scannen und eigene Listen erfassen", category: "Werksverkauf / Vernichtung" },
  "wvvn.finish": { label: "Eigene Listen abschließen", category: "Werksverkauf / Vernichtung" },
  "wvvn.delete": { label: "Positionen aus eigenen offenen Listen entfernen", category: "Werksverkauf / Vernichtung" },
  "wvvn.devices": { label: "Scanner freischalten/sperren (inkl. Erfassen, Abschließen und Entfernen am Gerät)", category: "Werksverkauf / Vernichtung" },
  "wvvn.articles": { label: "Gemeinsame Artikel und Verpackungseinheiten pflegen", category: "Werksverkauf / Vernichtung" },
  "wvvn.export": { label: "Listen und Tagesberichte als CSV herunterladen", category: "Werksverkauf / Vernichtung" },
  "wvvn.settings": { label: "Modulregeln und E-Mail-Versand einstellen", category: "Werksverkauf / Vernichtung" },
  "wvvn.import": { label: "Artikeldaten und historische Listen importieren", category: "Werksverkauf / Vernichtung" },
  "stempeluhr.view": { label: "Anwesenheiten und Änderungsprotokoll ansehen", category: "Stempeluhr" },
  "stempeluhr.terminal": { label: "Stempelterminals freischalten und sperren", category: "Stempeluhr" },
  "stempeluhr.employees": { label: "Mitarbeiter und Barcodekarten verwalten", category: "Stempeluhr" },
  "stempeluhr.correct": { label: "Zeiten anlegen und mit Begründung korrigieren", category: "Stempeluhr" },
  "stempeluhr.delete": { label: "Zeiten mit Begründung stornieren", category: "Stempeluhr" },
  "stempeluhr.export": { label: "Anwesenheiten exportieren und Berichte drucken", category: "Stempeluhr" },
  "stempeluhr.settings": { label: "Zeit-, Pausen- und Terminalregeln einstellen", category: "Stempeluhr" },
  "stempeluhr.import": { label: "Mitarbeiter und Stempelzeiten importieren", category: "Stempeluhr" },
  "system.liveview.control": { label: "Vollständige App-Steuerung inklusive Bearbeiten, Speichern und Löschen nach sichtbarer Ankündigung", category: "System" },
  "system.liveview": { label: "Sichtbar angekündigte App-Liveansichten ansehen", category: "System" },
  "system.liveview.manage": { label: "App-Liveansicht systemweit ein-/ausschalten", category: "System" },
  "system.view": { label: "Systemstatus, Update-Fortschritt und Sicherungsnachweise ansehen", category: "System" },
  "system.update": { label: "Serverupdates starten (zusätzlich System-Anzeigerecht erforderlich)", category: "System" },
  "einlagerung.view": { label: "Lagerübersicht und Bestände ansehen", category: "Einlagerung" },
  "einlagerung.scan": { label: "Einlagerungsscanner nutzen", category: "Einlagerung" },
  "einlagerung.full": { label: "Regal voll melden", category: "Einlagerung" },
  "einlagerung.release": { label: "Regal wieder freigeben", category: "Einlagerung" },
  "einlagerung.reservation.create": { label: "Vormerkung erstellen", category: "Einlagerung" },
  "einlagerung.reservation.edit": { label: "Vormerkung bearbeiten / abschließen", category: "Einlagerung" },
  "einlagerung.strategy": { label: "Einlagerungsstrategie pflegen", category: "Einlagerung" },
  "einlagerung.master": { label: "Lagerstammdaten pflegen", category: "Einlagerung" },
  "einlagerung.import": { label: "CSV-Daten importieren", category: "Einlagerung" },
  "einlagerung.replace": { label: "Datenstände durch Import ersetzen", category: "Einlagerung" },
  "einlagerung.settings": { label: "Einlagerungseinstellungen ändern", category: "Einlagerung" },
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
  for (const permission of ALL_PERMISSIONS.filter((p) => p.startsWith("einlagerung."))) {
    const defaults = permission === "einlagerung.view"
      ? ["comet_lager", "comet_leitstand", "comet_viewer"]
      : ["einlagerung.scan", "einlagerung.full", "einlagerung.reservation.create"].includes(permission)
        ? ["comet_lager", "comet_leitstand"]
        : ["einlagerung.release", "einlagerung.reservation.edit", "einlagerung.strategy"].includes(permission)
          ? ["comet_leitstand"] : [];
    for (const role of defaults) {
      await db.execute(sql`INSERT INTO role_permissions (role, permission, allowed)
        VALUES (${role}, ${permission}, true) ON CONFLICT (role, permission) DO NOTHING`);
    }
  }
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
