import { pool } from "@workspace/db";
import { z } from "zod/v4";
import { CreatePalletPurchaseBody } from "@workspace/api-zod";

let ensured: Promise<void> | undefined;
export function ensurePalletPurchasesTable() {
  if (!ensured) ensured = pool.query(`CREATE TABLE IF NOT EXISTS pallet_purchases (
    id SERIAL PRIMARY KEY, purchase_date DATE NOT NULL, amount INTEGER NOT NULL,
    spedition_name TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds',clock_timestamp()),
    CONSTRAINT pallet_purchase_positive_amount CHECK(amount>0))`).then(() => {}).catch((e) => { ensured = undefined; throw e; });
  return ensured;
}
export function berlinToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function validPurchaseDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function purchaseInput(input: unknown) {
  const b = CreatePalletPurchaseBody.parse(input);
  return z.object({
    purchaseDate: z.string().refine((s) => {
      try { return validPurchaseDate(s) && s <= berlinToday(); } catch { return false; }
    }, "Bitte ein gültiges, nicht zukünftiges Kaufdatum eingeben."),
    amount: z.number().int().positive().max(2147483647),
    speditionName: z.string().trim().min(1).max(200),
    reference: z.string().trim().max(200), note: z.string().trim().max(2000),
    expectedUpdatedAt: z.string().optional(),
  }).parse(b);
}
export function calculateOwnedStock(inventory: number | null, physicalDelta: number, purchasedSinceInventory: number, accountBalances: number) {
  const plantStock = inventory === null ? null : inventory + physicalDelta + purchasedSinceInventory;
  return { plantStock, ownedStock: plantStock === null ? null : plantStock - accountBalances };
}
