import type { D } from "../lib";
import { parseDeliveryTerm, todayOrdinal } from "./delivery-deadlines";

export type ReservationDeadline = {
  status: "overdue" | "pending" | "unknown" | "inactive";
  label: string;
  detail: string;
};

/** Read-only classification. A week expires after Sunday, never at its start. */
export function reservationDeadline(row: D, today = todayOrdinal()): ReservationDeadline {
  if (row.status !== "offen") return { status: "inactive", label: "", detail: "" };
  const term = parseDeliveryTerm(row.termin);
  const plus = String(row.plusKw ?? "").trim();
  const weeks = plus === "" ? 0 : /^\d+$/.test(plus) ? Number(plus) : NaN;
  const unknown = (detail: string): ReservationDeadline => ({ status: "unknown", label: "Termin unklar", detail });
  if (term.day == null) return unknown("Termin fehlt oder ist nicht eindeutig als Datum bzw. KW.Jahr lesbar.");
  if (!Number.isSafeInteger(weeks)) return unknown("Plus-KW ist keine eindeutige, nicht negative Anzahl Wochen.");
  const due = term.day + (term.kind === "week" ? 6 : 0) + weeks * 7;
  if (!Number.isSafeInteger(due) || due > Date.UTC(9999, 11, 31) / 86_400_000)
    return unknown("Termin mit Plus-KW liegt außerhalb des auswertbaren Datumsbereichs.");
  const date = new Date(due * 86_400_000);
  const label = `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}`;
  const detail = `${term.kind === "week" ? "KW-Ende" : "Termin"}${weeks ? ` + ${weeks} KW` : ""}: ${label} (einschließlich)`;
  return { status: due < today ? "overdue" : "pending", label: due < today ? "Überfällig" : "", detail };
}

export function hasOverdueReservation(rows: D[]) {
  return rows.some((row) => row.status === "offen" && row.reservationDeadline?.status === "overdue");
}
