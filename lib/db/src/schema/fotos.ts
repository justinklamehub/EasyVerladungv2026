import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shipmentsTable } from "./shipments";
import { gefahrgutChecklistenTable } from "./gefahrgut";

export const shipmentFotosTable = pgTable("shipment_fotos", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").references(() => shipmentsTable.id),
  gefahrgutChecklisteId: integer("gefahrgut_checkliste_id").references(() => gefahrgutChecklistenTable.id),
  kennzeichen: text("kennzeichen"),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name"),
  contentType: text("content_type"),
  hochgeladenVon: text("hochgeladen_von"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertShipmentFotoSchema = createInsertSchema(shipmentFotosTable).omit({ id: true, createdAt: true });
export type InsertShipmentFoto = z.infer<typeof insertShipmentFotoSchema>;
export type ShipmentFoto = typeof shipmentFotosTable.$inferSelect;
