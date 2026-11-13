import type { Shipment } from "@workspace/api-client-react";
import { format } from "date-fns";

/** Shared by CSV and Excel so quantities and manual-entry columns stay identical. */
export function buildExportRows(rows: Shipment[], isCometUser = false) {
  return rows.map((s) => ({
    ID: s.id,
    Kennzeichen: s.kennzeichen ?? "",
    Ladelistennummer: s.ladelistennummer ?? "",
    Palettenscheinnummer: s.palettenscheinnummer ?? "",
    "Europaletten verladen": s.europalettenVerladen ?? "",
    ...(isCometUser ? { "Düsseldorfer verladen": s.duesseldorferVerladen ?? "" } : {}),
    Spedition: s.speditionName ?? "",
    "Sub-Spedition": s.subSpedition ?? "",
    "LKW-Art": s.lkwArt ?? "",
    Relation: s.relation ?? "",
    Bezeichnung: s.bezeichnung ?? "",
    "ETA-Datum": s.etaDate ? format(new Date(s.etaDate), "dd.MM.yyyy") : "",
    "ETA-Zeit": s.etaTime ?? "",
    "ATA-Datum": s.ataDate ? format(new Date(s.ataDate), "dd.MM.yyyy") : "",
    "ATA-Zeit": s.ataTime ?? "",
    Status: s.status,
    Ware: s.wareStatus ?? "",
    Tor: s.tor ?? "",
    Gesperrt: s.gesperrtFuerSpedition ? "Ja" : "Nein",
    Bemerkungen: s.bemerkungen ?? "",
  }));
}
