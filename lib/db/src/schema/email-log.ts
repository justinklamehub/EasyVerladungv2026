import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const emailLogTable = pgTable("email_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  toAddresses: text("to_addresses").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html"),
  bodyText: text("body_text"),
  status: text("status").notNull().default("sent"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailLog = typeof emailLogTable.$inferSelect;
