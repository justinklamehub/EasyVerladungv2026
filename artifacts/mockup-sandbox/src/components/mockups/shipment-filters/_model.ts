import { z } from "zod";

export const SHIPMENT_WORK_VIEWS_KEY = "shipments_work_views";
export const MAX_SHIPMENT_WORK_VIEWS = 30;
const calendarDate = z.string().refine(value => {
  if (value === "") return true;
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Ungültiges Datum");

export const workViewDateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.enum(["today", "tomorrow", "thisWeek", "all"]) }).strict(),
  z.object({ mode: z.literal("custom"), from: calendarDate, to: calendarDate }).strict(),
]).refine(date => date.mode !== "custom" || !date.from || !date.to || date.from <= date.to,
  "Das Enddatum liegt vor dem Anfangsdatum");

export const shipmentWorkViewFiltersSchema = z.object({
  search: z.string().max(200),
  status: z.enum(["__all__", "Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"]),
  speditionId: z.string().regex(/^(?:__all__|[1-9]\d{0,9})$/),
  lkwArt: z.string().min(1).max(100),
  tor: z.string().min(1).max(100),
  date: workViewDateSchema,
  sortField: z.enum(["kennzeichen", "etaDate", "status", "tor", "speditionName"]),
  sortDir: z.enum(["asc", "desc"]),
  showAbgefertigt: z.boolean(),
  showStorniert: z.boolean(),
}).strict();

export const shipmentWorkViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60).transform(value => value.replace(/\s+/g, " ")),
  filters: shipmentWorkViewFiltersSchema,
}).strict();

export const shipmentWorkViewsSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0).max(2_147_483_647),
  views: z.array(shipmentWorkViewSchema).max(MAX_SHIPMENT_WORK_VIEWS),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  value.views.forEach((view, index) => {
    const name = view.name.normalize("NFKC").toLocaleLowerCase("de-DE");
    if (ids.has(view.id) || names.has(name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["views", index], message: "Ansichten benötigen eindeutige Namen und IDs" });
    }
    ids.add(view.id);
    names.add(name);
  });
});

export type WorkViewDate = z.infer<typeof workViewDateSchema>;
export type ShipmentWorkViewFilters = z.infer<typeof shipmentWorkViewFiltersSchema>;
export type ShipmentWorkView = z.infer<typeof shipmentWorkViewSchema>;
export type ShipmentWorkViews = z.infer<typeof shipmentWorkViewsSchema>;
export const EMPTY_SHIPMENT_WORK_VIEWS: ShipmentWorkViews = { version: 1, revision: 0, views: [] };

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Resolve at use time, in the user's local calendar; never freeze relative dates when saving. */
export function resolveWorkViewDates(range: WorkViewDate, now = new Date()): { from: string; to: string } {
  if (range.mode === "custom") return { from: range.from, to: range.to };
  if (range.mode === "all") return { from: "", to: "" };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (range.mode === "tomorrow") start.setDate(start.getDate() + 1);
  if (range.mode === "thisWeek") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  if (range.mode === "thisWeek") end.setDate(end.getDate() + 6);
  return { from: localDate(start), to: localDate(end) };
}

export function sameWorkViewFilters(a: ShipmentWorkViewFilters, b: ShipmentWorkViewFilters): boolean {
  return (Object.keys(a) as (keyof ShipmentWorkViewFilters)[]).every(key =>
    key === "date" ? JSON.stringify(a.date) === JSON.stringify(b.date) : a[key] === b[key]);
}
