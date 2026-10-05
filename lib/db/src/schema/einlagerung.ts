import { pgTable, serial, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Configuration and actual stock snapshots are deliberately separate.
export const einlagerungRecordsTable = pgTable("einlagerung_records", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("einlagerung_records_kind_idx").on(t.kind)]);

export const einlagerungDatasetsTable = pgTable("einlagerung_datasets", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  filename: text("filename").notNull(),
  rows: jsonb("rows").$type<Record<string, string>[]>().notNull(),
  rowCount: integer("row_count").notNull(),
  importedBy: text("imported_by").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("einlagerung_datasets_type_idx").on(t.type)]);

export const einlagerungEventsTable = pgTable("einlagerung_events", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  username: text("username").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEinlagerungRecordSchema = createInsertSchema(einlagerungRecordsTable).omit({ id: true, updatedAt: true });
export type InsertEinlagerungRecord = z.infer<typeof insertEinlagerungRecordSchema>;
export type EinlagerungRecord = typeof einlagerungRecordsTable.$inferSelect;
