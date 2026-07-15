import { pgTable, serial, integer, text, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { shipmentsTable } from "./shipments";

export const wareneingangProtokollTable = pgTable("wareneingang_protokolle", {
  id:                         serial("id").primaryKey(),
  lfdNr:                      integer("lfd_nr").notNull(),
  shipmentId:                 integer("shipment_id").references(() => shipmentsTable.id),
  lkwid:                      text("lkwid"),
  palettenscheinNr:           text("palettenschein_nr"),
  anlieferungsdatum:          date("anlieferungsdatum"),
  beauftrageSpedition:        text("beauftrage_spedition"),
  ausfuehrendeSpedition:      text("ausfuehrende_spedition"),
  kfzKennzeichen:             text("kfz_kennzeichen"),
  anzPaletten:                text("anz_paletten"),
  defektePaletten:            text("defekte_paletten"),
  anzKartonsSoll:             text("anz_kartons_soll"),
  anzKartonsIst:              text("anz_kartons_ist"),
  artRetoure:                 boolean("art_retoure").default(false),
  artServiceware:             boolean("art_serviceware").default(false),
  artSonstiges:               boolean("art_sonstiges").default(false),
  lagerplatzRetoure:          text("lagerplatz_retoure"),
  lagerplatzServiceware:      text("lagerplatz_serviceware"),
  lagerplatzSonstiges:        text("lagerplatz_sonstiges"),
  bemerkungen:                text("bemerkungen"),
  wareErhaltenDatum:          date("ware_erhalten_datum"),
  unterschrift:               text("unterschrift"),
  druckbuchstaben:            text("druckbuchstaben"),
  eingereichtAt:              timestamp("eingereicht_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WareneingangProtokoll = typeof wareneingangProtokollTable.$inferSelect;
