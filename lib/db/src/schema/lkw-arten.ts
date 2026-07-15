import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";

export const lkwArtenTable = pgTable("lkw_arten", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  typ:       text("typ").notNull(),
  aktiv:     boolean("aktiv").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type LkwArt = typeof lkwArtenTable.$inferSelect;
