import { UpdateShipmentBody } from "./generated/api";

export const SPEDITION_EDITABLE_SHIPMENT_FIELDS = ["kennzeichen", "etaTime", "subSpedition"] as const;
export const SpeditionShipmentEditBody = UpdateShipmentBody.pick({
  kennzeichen: true, etaTime: true, subSpedition: true,
}).strict().refine(
  body => body.etaTime == null || body.etaTime === "" || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.etaTime),
  { message: "Ungültige ETA-Uhrzeit" },
);

export const SHIPMENT_PRINT_PERMISSION = "shipment.print";
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
