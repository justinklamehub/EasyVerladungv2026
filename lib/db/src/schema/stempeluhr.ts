import { pgTable, serial, text, boolean, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const clockEmployeesTable = pgTable("clock_employees", {
  id: serial("id").primaryKey(),
  cardNumber: text("card_number").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  provider: text("provider").notNull().default(""),
  activity: text("activity").notNull().default(""),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clockEntriesTable = pgTable("clock_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => clockEmployeesTable.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  originalStartedAt: timestamp("original_started_at", { withTimezone: true }).notNull(),
  originalEndedAt: timestamp("original_ended_at", { withTimezone: true }),
  rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
  pauseOverride: integer("pause_override"),
  source: text("source").notNull(),
  legacyId: text("legacy_id").unique(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("clock_one_open_entry").on(t.employeeId).where(sql`${t.endedAt} IS NULL AND ${t.deletedAt} IS NULL`)]);
export const clockSettingsTable = pgTable("clock_settings", {
  id: integer("id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clockAuditTable = pgTable("clock_audit", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  before: jsonb("before_data"),
  after: jsonb("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clockTerminalsTable = pgTable("clock_terminals", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
export const clockReceiptsTable = pgTable("clock_receipts", {
  terminalId: integer("terminal_id").notNull().references(() => clockTerminalsTable.id),
  requestId: text("request_id").notNull(),
  cardNumber: text("card_number").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
}, (t) => [uniqueIndex("clock_receipt_request").on(t.terminalId, t.requestId)]);

export const insertClockEmployeeSchema = createInsertSchema(clockEmployeesTable).omit({ id: true, updatedAt: true });
export const insertClockEntrySchema = createInsertSchema(clockEntriesTable).omit({ id: true, updatedAt: true });
export type ClockEmployeeRecord = typeof clockEmployeesTable.$inferSelect;
export type ClockEntryRecord = typeof clockEntriesTable.$inferSelect;
