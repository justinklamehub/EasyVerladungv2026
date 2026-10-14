import { pgTable, serial, date, integer, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Intentionally no spedition_id: a purchase is COMET property, never an account entry.
export const palletPurchasesTable = pgTable("pallet_purchases", {
  id: serial("id").primaryKey(),
  purchaseDate: date("purchase_date").notNull(),
  amount: integer("amount").notNull(),
  speditionName: text("spedition_name").notNull(),
  reference: text("reference").notNull().default(""),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("pallet_purchase_positive_amount", sql`${t.amount} > 0`)]);
export const insertPalletPurchaseSchema = createInsertSchema(palletPurchasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type PalletPurchaseRecord = typeof palletPurchasesTable.$inferSelect;
