import { pgTable, serial, integer, text, timestamp, unique, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const speditionenTable = pgTable("speditionen", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kuerzel: text("kuerzel").notNull().unique(),
  ansprechpartner: text("ansprechpartner"),
  email: text("email"),
  telefon: text("telefon"),
  status: text("status").notNull().default("aktiv"),
  bemerkungen: text("bemerkungen"),
  palletFaktor: integer("pallet_faktor").notNull().default(1),
  preisProKm: doublePrecision("preis_pro_km"),
  mindestpreisProFahrt: doublePrecision("mindestpreis_pro_fahrt"),
  palettenAufschlag: doublePrecision("paletten_aufschlag"),
  kraftstoffzuschlagProzent: doublePrecision("kraftstoffzuschlag_prozent"),
  fixkostenProFahrt: doublePrecision("fixkosten_pro_fahrt"),
  mautProKm: doublePrecision("maut_pro_km"),
  dailyShipmentLimit: integer("daily_shipment_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const speditionPermissionsTable = pgTable("spedition_permissions", {
  id: serial("id").primaryKey(),
  grantingSpeditionId: integer("granting_spedition_id").notNull().references(() => speditionenTable.id, { onDelete: "cascade" }),
  receivingSpeditionId: integer("receiving_spedition_id").notNull().references(() => speditionenTable.id, { onDelete: "cascade" }),
  permissionLevel: text("permission_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique("uq_sped_permissions").on(t.grantingSpeditionId, t.receivingSpeditionId)]);

export const speditionContactsTable = pgTable("spedition_contacts", {
  id: serial("id").primaryKey(),
  speditionId: integer("spedition_id").notNull().references(() => speditionenTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  bereich: text("bereich"),
  telefon: text("telefon"),
  email: text("email"),
  bemerkungen: text("bemerkungen"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const speditionRelationenTable = pgTable("spedition_relationen", {
  id: serial("id").primaryKey(),
  speditionId: integer("spedition_id").notNull().references(() => speditionenTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSpeditionSchema = createInsertSchema(speditionenTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpedition = z.infer<typeof insertSpeditionSchema>;
export type Spedition = typeof speditionenTable.$inferSelect;
export type SpeditionContact = typeof speditionContactsTable.$inferSelect;
