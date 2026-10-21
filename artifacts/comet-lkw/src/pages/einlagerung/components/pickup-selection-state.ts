export function pickupNumbers(rows: readonly Record<string, unknown>[]) {
  return [...new Set(rows.map((r) => String(r.deliveryNumber ?? "").trim()).filter((n) => /^8\d+$/.test(n)))];
}
export function visiblePickupSelection(chosen: ReadonlySet<string>, numbers: readonly string[]) {
  return numbers.filter((n) => chosen.has(n));
}
