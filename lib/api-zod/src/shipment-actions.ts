import { UpdateShipmentBody } from "./generated/api";

export const SPEDITION_EDITABLE_SHIPMENT_FIELDS = ["kennzeichen", "etaTime", "subSpedition", "bezeichnung"] as const;
export const SPEDITION_UNPROCESSED_SHIPMENT_FIELDS = [
  ...SPEDITION_EDITABLE_SHIPMENT_FIELDS, "etaDate", "relation", "lkwArt", "bemerkungen", "telefon", "wareStatus",
] as const;
const validEtaTime = (body: { etaTime?: string | null }) =>
  body.etaTime == null || body.etaTime === "" || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.etaTime);
export const SpeditionShipmentEditBody = UpdateShipmentBody.pick({
  kennzeichen: true, etaTime: true, subSpedition: true, bezeichnung: true,
}).strict().refine(validEtaTime, { message: "Ungültige ETA-Uhrzeit" });
export const SpeditionUnprocessedShipmentEditBody = UpdateShipmentBody.pick({
  kennzeichen: true, etaTime: true, subSpedition: true, bezeichnung: true,
  etaDate: true, relation: true, lkwArt: true, bemerkungen: true, telefon: true, wareStatus: true,
}).strict().refine(validEtaTime, { message: "Ungültige ETA-Uhrzeit" });

/** Include legacy records where the COMET marker was not yet set on print/arrival. */
export function hasCometShipmentActivity(shipment: {
  cometBearbeitet?: boolean; gesperrtFuerSpedition?: boolean; wareStatus?: string | null;
  ataDate?: string | null; ataTime?: string | null; tor?: string | null; status?: string;
} | null | undefined): boolean {
  return !!shipment && (
    !!shipment.cometBearbeitet || !!shipment.gesperrtFuerSpedition ||
    shipment.wareStatus === "ausgedruckt" || !!shipment.ataDate || !!shipment.ataTime || !!shipment.tor ||
    ["Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"].includes(shipment.status ?? "")
  );
}

export const SHIPMENT_PRINT_PERMISSION = "shipment.print";
export function canSpeditionCancelShipment(shipment: Parameters<typeof hasCometShipmentActivity>[0]): boolean {
  return !!shipment && ["Angemeldet", "Erwartet"].includes(shipment.status ?? "") && !hasCometShipmentActivity(shipment);
}

export const SHIPMENT_ADVANCE_PERMISSION = "shipment.advance";

export function nextShipmentStatus(status: string): string | null {
  switch (status) {
    case "Angemeldet": return "Angekommen";
    case "Angekommen": return "in Verladung";
    case "in Verladung": return "Verladen";
    default: return null;
  }
}

// These actions remain COMET-only, including explicitly permitted custom roles.
export function isInternalShipmentActionRole(role: string): boolean {
  return !!role && !["speditions_admin", "speditions_bearbeiter", "speditions_viewer"].includes(role);
}
