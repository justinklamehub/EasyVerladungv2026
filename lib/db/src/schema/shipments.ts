import { pgTable, serial, text, boolean, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  bezeichnung: text("bezeichnung"),
  kennzeichen: text("kennzeichen"),
  relation: text("relation"),
  speditionId: integer("spedition_id"),
  subSpeditionId: integer("sub_spedition_id"),
  bemerkungen: text("bemerkungen"),
  telefon: text("telefon"),
  etaDate: date("eta_date"),
  etaTime: text("eta_time"),
  ataDate: date("ata_date"),
  ataTime: text("ata_time"),
  lkwArt: text("lkw_art"),
  status: text("status").notNull().default("Angemeldet"),
  tor: text("tor"),
  wareStatus: text("ware_status").default("nicht bereit"),
  cometBearbeitet: boolean("comet_bearbeitet").notNull().default(false),
  gesperrtFuerSpedition: boolean("gesperrt_fuer_spedition").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;
