import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const changelogEntriesTable = pgTable("changelog_entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  bodyHtml: text("body_html").notNull().default(""),
  version: text("version"),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ChangelogEntry = typeof changelogEntriesTable.$inferSelect;
