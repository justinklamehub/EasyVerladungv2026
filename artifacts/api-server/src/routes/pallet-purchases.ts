import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { ZodError as GeneratedZodError } from "zod";
import { db, palletPurchasesTable, auditLogTable } from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { can, type Permission } from "../lib/permissions";
import { ensurePalletPurchasesTable, purchaseInput, validPurchaseDate } from "../lib/pallet-purchases";
import { DeletePalletPurchaseBody, ListPalletPurchasesResponse, UpdatePalletPurchaseResponse } from "@workspace/api-zod";

const router = Router();
class PurchaseError extends Error { constructor(message: string, public status: number) { super(message); } }
async function access(req: Request, permission?: Permission) {
  if (req.session.speditionId != null || req.session.role?.startsWith("speditions_"))
    throw new PurchaseError("Kaufpaletten sind nur intern in COMET zugänglich.", 403);
  if (permission && !(await can(req.session.role!, permission))) throw new PurchaseError("Keine Berechtigung.", 403);
  await ensurePalletPurchasesTable();
}
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof PurchaseError) { res.status(error.status).json({ error: error.message }); return; }
      if (error instanceof z.ZodError || error instanceof GeneratedZodError) { res.status(400).json({ error: error.issues[0]?.message || "Ungültige Eingabe." }); return; }
      req.log.error({ err: error }, "Kaufpaletten konnten nicht verarbeitet werden");
      res.status(500).json({ error: "Kaufpaletten konnten nicht verarbeitet werden." });
    }
  };
}
const idOf = (req: Request) => z.coerce.number().int().positive().parse(req.params.id);
const output = (r: typeof palletPurchasesTable.$inferSelect) => ({
  ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});
function version(actual: Date, expected?: string) {
  if (!expected || actual.toISOString() !== expected) throw new PurchaseError("Der Kauf wurde inzwischen geändert. Bitte neu laden.", 409);
}
function announce(req: Request) {
  // No customer-account event and no spedition room: purchases are strictly internal.
  req.app.get("io")?.to("comet").emit("pallet_purchase.updated", {});
}
router.get("/pallet-purchases", requireAuth, handle(async (req, res) => {
  await access(req);
  const q = z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).parse(req.query);
  for (const d of [q.dateFrom, q.dateTo]) if (d) {
    try { if (!validPurchaseDate(d)) throw new Error(); } catch { throw new PurchaseError("Ungültiger Datumsfilter.", 400); }
  }
  if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) throw new PurchaseError("Von-Datum muss vor Bis-Datum liegen.", 400);
  const conditions = [];
  if (q.dateFrom) conditions.push(gte(palletPurchasesTable.purchaseDate, q.dateFrom));
  if (q.dateTo) conditions.push(lte(palletPurchasesTable.purchaseDate, q.dateTo));
  const rows = await db.select().from(palletPurchasesTable).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(palletPurchasesTable.purchaseDate), desc(palletPurchasesTable.id));
  res.json(ListPalletPurchasesResponse.parse(rows.map(output)));
}));
router.post("/pallet-purchases", requireAuth, handle(async (req, res) => {
  await access(req, "pallet.create");
  const { expectedUpdatedAt: _, ...input } = purchaseInput(req.body);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.insert(palletPurchasesTable).values({ ...input, createdBy: req.session.userId }).returning();
    await tx.insert(auditLogTable).values({ userId: req.session.userId, module: "pallet_purchase", recordId: row.id, field: "created", oldValue: null, newValue: JSON.stringify(output(row)) });
    return row;
  });
  announce(req); res.status(201).json(UpdatePalletPurchaseResponse.parse(output(result)));
}));
router.put("/pallet-purchases/:id", requireAuth, handle(async (req, res) => {
  await access(req, "pallet.edit");
  const id = idOf(req), { expectedUpdatedAt, ...input } = purchaseInput(req.body);
  const result = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(palletPurchasesTable).where(eq(palletPurchasesTable.id, id)).for("update");
    if (!old) throw new PurchaseError("Kauf nicht gefunden.", 404);
    version(old.updatedAt, expectedUpdatedAt);
    const [row] = await tx.update(palletPurchasesTable).set({ ...input, updatedAt: sql`GREATEST(date_trunc('milliseconds',clock_timestamp()), ${palletPurchasesTable.updatedAt} + interval '1 millisecond')` }).where(eq(palletPurchasesTable.id, id)).returning();
    await tx.insert(auditLogTable).values({ userId: req.session.userId, module: "pallet_purchase", recordId: id, field: "updated", oldValue: JSON.stringify(output(old)), newValue: JSON.stringify(output(row)) });
    return row;
  });
  announce(req); res.json(UpdatePalletPurchaseResponse.parse(output(result)));
}));
router.delete("/pallet-purchases/:id", requireAuth, handle(async (req, res) => {
  await access(req, "pallet.delete");
  const id = idOf(req), b = DeletePalletPurchaseBody.parse(req.body);
  await db.transaction(async (tx) => {
    const [old] = await tx.select().from(palletPurchasesTable).where(eq(palletPurchasesTable.id, id)).for("update");
    if (!old) throw new PurchaseError("Kauf nicht gefunden.", 404);
    version(old.updatedAt, b.expectedUpdatedAt);
    await tx.delete(palletPurchasesTable).where(eq(palletPurchasesTable.id, id));
    await tx.insert(auditLogTable).values({ userId: req.session.userId, module: "pallet_purchase", recordId: id, field: "deleted", oldValue: JSON.stringify(output(old)), newValue: null });
  });
  announce(req); res.sendStatus(204);
}));
export default router;
