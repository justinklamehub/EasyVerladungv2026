import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shipmentsTable } from "./shipments";
import { speditionenTable } from "./speditionen";

export const lkwAustraegeTable = pgTable("lkw_austraege", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").references(() => shipmentsTable.id),
  ladelistennummer: text("ladelistennummer"),
  palettenscheinnummer: text("palettenscheinnummer"),
  datum: date("datum").notNull(),
  kennzeichen: text("kennzeichen"),
  beauftragteSpeditionId: integer("beauftragte_spedition_id").references(() => speditionenTable.id),
  subSpedition: text("sub_spedition"),
  tor: text("tor"),
  vonCometEuropaletten: integer("von_comet_europaletten").notNull().default(0),
  vonCometLadungssicherung: integer("von_comet_ladungssicherung").notNull().default(0),
  vonDefektePaletten: integer("von_defekte_paletten").notNull().default(0),
  anCometEuropaletten: integer("an_comet_europaletten").notNull().default(0),
  anCometLadungssicherung: integer("an_comet_ladungssicherung").notNull().default(0),
  anDefektePaletten: integer("an_defekte_paletten").notNull().default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLkwAustragSchema = createInsertSchema(lkwAustraegeTable).omit({ id: true, createdAt: true });
export type InsertLkwAustrag = z.infer<typeof insertLkwAustragSchema>;
export type LkwAustrag = typeof lkwAustraegeTable.$inferSelect;
