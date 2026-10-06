export const DEFAULT_DELIVERY_MAIL_DAYS = 2;
export const DEFAULT_DELIVERY_MAIL_SCOPE = "urgent";
export const DELIVERY_MAIL_SCOPE_OPTIONS = [
  { value: "urgent", label: "Kritisch/überfällig + bald fällig" },
  { value: "critical", label: "Nur kritisch/überfällig" },
  { value: "all", label: "Alle Termine" },
] as const;
export type DeliveryMailScope = (typeof DELIVERY_MAIL_SCOPE_OPTIONS)[number]["value"];
export function deliveryMailScope(value?: string): DeliveryMailScope {
  if (value == null) return DEFAULT_DELIVERY_MAIL_SCOPE;
  if (!DELIVERY_MAIL_SCOPE_OPTIONS.some((o) => o.value === value)) throw new Error("Ungültige Auswahl für den Mail-Inhalt.");
  return value as DeliveryMailScope;
}
export const DEFAULT_DELIVERY_MAIL_SUBJECT = "Liefertermine – {{app_name}} – {{faellige_anzahl}} fällig ({{datum}})";
export const DEFAULT_DELIVERY_MAIL_BODY = "Guten Tag,\n\n{{zusammenfassung}}\n\nAuftragsimport: {{importstand}}\n{{hinweise}}\n\n{{erklaerung}}\n\n{{tabelle}}";
export const DELIVERY_MAIL_PLACEHOLDERS = ["app_name", "datum", "pruefzeit", "faellige_anzahl", "kritische_anzahl", "anzahl", "paletten",
  "tage_vor_liefertermin", "zusammenfassung", "importstand", "hinweise", "erklaerung", "tabelle"];
export function deliveryMailDays(value?: string) {
  if (value == null) return DEFAULT_DELIVERY_MAIL_DAYS;
  if (!/^\d+$/.test(value.trim()) || Number(value) > 3650) throw new Error("Tage vor Liefertermin müssen eine ganze Zahl von 0 bis 3650 sein.");
  return Number(value);
}
