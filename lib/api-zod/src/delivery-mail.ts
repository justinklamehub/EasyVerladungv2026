export const DEFAULT_DELIVERY_MAIL_DAYS = 2;
export const DEFAULT_DELIVERY_MAIL_SUBJECT = "Liefertermine – {{app_name}} – {{faellige_anzahl}} fällig ({{datum}})";
export const DEFAULT_DELIVERY_MAIL_BODY = "Guten Tag,\n\n{{zusammenfassung}}\n\nAuftragsimport: {{importstand}}\n{{hinweise}}\n\n{{erklaerung}}\n\n{{tabelle}}";
export const DELIVERY_MAIL_PLACEHOLDERS = ["app_name", "datum", "pruefzeit", "faellige_anzahl", "kritische_anzahl", "anzahl", "paletten",
  "tage_vor_liefertermin", "zusammenfassung", "importstand", "hinweise", "erklaerung", "tabelle"];
export function deliveryMailDays(value?: string) {
  if (value == null) return DEFAULT_DELIVERY_MAIL_DAYS;
  if (!/^\d+$/.test(value.trim()) || Number(value) > 3650) throw new Error("Tage vor Liefertermin müssen eine ganze Zahl von 0 bis 3650 sein.");
  return Number(value);
}
