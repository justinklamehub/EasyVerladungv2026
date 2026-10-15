import type { PoolClient } from "@workspace/db";
import { ClockError } from "./model";

const latestStored = `COALESCE((SELECT MAX(SUBSTRING(card_number FROM 2)::integer)
  FROM clock_employees WHERE card_number ~ '^M[0-9]{8}$'),0)`;

export function formatClockCardNumber(number: number) {
  if (!Number.isInteger(number) || number < 1 || number > 99999999)
    throw new ClockError("Der Nummernbereich für Mitarbeiterkarten ist ausgeschöpft.");
  return `M${String(number).padStart(8, "0")}`;
}

// Preview does not reserve a number. Existing/nonstandard card numbers stay intact.
export async function previewClockCardNumber(c: PoolClient) {
  const { rows } = await c.query(`SELECT GREATEST(last_number,${latestStored})+1 AS next_number
    FROM clock_card_counter WHERE id=1`);
  return formatClockCardNumber(rows[0].next_number);
}

// Call inside the employee-creation transaction. The persistent high-water mark
// prevents reuse after deletion; the UPDATE serializes concurrent allocations.
export async function allocateClockCardNumber(c: PoolClient) {
  const { rows } = await c.query(`UPDATE clock_card_counter
    SET last_number=GREATEST(last_number,${latestStored})+1
    WHERE id=1 AND GREATEST(last_number,${latestStored})<99999999
    RETURNING last_number`);
  if (!rows.length) throw new ClockError("Der Nummernbereich für Mitarbeiterkarten ist ausgeschöpft.");
  return formatClockCardNumber(rows[0].last_number);
}

export function assertClockCardUnchanged(actual: string, requested: string) {
  if (actual !== requested) throw new ClockError("Die Kartennummer wird automatisch vergeben und kann nicht geändert werden.");
}

export function assertAutomaticClockCardNumber(body: object) {
  if (Object.prototype.hasOwnProperty.call(body, "cardNumber"))
    throw new ClockError("Die Kartennummer wird automatisch vergeben und darf nicht vorgegeben werden.");
}
