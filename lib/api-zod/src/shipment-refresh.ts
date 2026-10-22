export const SHIPMENT_REFRESH_KEY = "shipment_refresh_interval_seconds";
export const SHIPMENT_REFRESH_DEFAULT = 30;
export const SHIPMENT_REFRESH_MIN = 5;
export const SHIPMENT_REFRESH_MAX = 3600;

export function parseShipmentRefreshSeconds(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new Error("Bitte eine ganze Zahl von 5 bis 3600 Sekunden eingeben.");
  }
  const seconds = Number(value.trim());
  if (!Number.isSafeInteger(seconds) || seconds < SHIPMENT_REFRESH_MIN || seconds > SHIPMENT_REFRESH_MAX) {
    throw new Error("Bitte eine ganze Zahl von 5 bis 3600 Sekunden eingeben.");
  }
  return seconds;
}

export function resolveShipmentRefreshSeconds(value: unknown): number {
  try { return parseShipmentRefreshSeconds(value); }
  catch { return SHIPMENT_REFRESH_DEFAULT; }
}
