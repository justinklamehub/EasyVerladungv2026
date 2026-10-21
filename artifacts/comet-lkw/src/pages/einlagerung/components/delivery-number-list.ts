const HEADER = /^(?:liefer(?:ungs)?(?:nummern?|nr\.?)|deliverynumber)$/i;
export function parseDeliveryNumbers(raw: string): string[] {
  const tokens = raw.replace(/^\uFEFF/, "").split(/[\s,;]+/u).map((v) => v.replace(/^["']+|["']+$/g, "").trim()).filter(Boolean).filter((v) => !HEADER.test(v));
  const invalid = tokens.filter((v) => !/^\d{1,100}$/.test(v));
  if (invalid.length) throw new Error(`Ungültige Liefernummer: ${invalid[0].slice(0, 50)}. Bitte vollständige Nummern als Text, nicht in wissenschaftlicher Schreibweise, einfügen.`);
  const numbers = [...new Set(tokens)];
  if (raw.trim() && !numbers.length) throw new Error("Die Liste enthält keine Liefernummern.");
  if (numbers.length > 10000) throw new Error("Bitte maximal 10.000 verschiedene Liefernummern auf einmal einfügen.");
  return numbers;
}
/** Keep numbers as strings and compile once, even for large Excel selections. */
export function deliveryNumberMatcher(numbers: readonly string[] = []) {
  const wanted = new Set(numbers.map((v) => v.trim()).filter(Boolean));
  return (value: unknown) => !wanted.size || wanted.has(String(value ?? "").trim());
}
export function pastedDeliveryNumbers(raw: string): string[] | null {
  try { const numbers = parseDeliveryNumbers(raw); return numbers.length > 1 ? numbers : null; }
  catch { return null; }
}

/** Excel cells are limited to 32,767 characters; do not truncate large active lists. */
export function deliveryNumberDetails(numbers: readonly string[] = []): string[][] {
  const rows: string[][] = [];
  let chunk = "";
  for (const number of numbers) {
    if (chunk && chunk.length + number.length + 2 > 30000) {
      rows.push([rows.length ? "Liefernummernliste (Fortsetzung)" : "Liefernummernliste (exakt, oder)", chunk]);
      chunk = "";
    }
    chunk += `${chunk ? ", " : ""}${number}`;
  }
  rows.push([rows.length ? "Liefernummernliste (Fortsetzung)" : "Liefernummernliste (exakt, oder)", chunk || "Alle"]);
  return rows;
}
