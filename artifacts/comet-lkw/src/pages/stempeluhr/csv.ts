export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV remains text throughout; never coerce card numbers to numbers. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] ?? "";
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cur = "", quoted = false, closed = false;
  const field = () => { row.push(cur); cur = ""; closed = false; };
  const finish = () => { field(); if (row.some((x) => x.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (text[i + 1] === '"') { cur += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (c === delim) field();
    else if (c === "\r" || c === "\n") { if (c === "\r" && text[i + 1] === "\n") i++; finish(); }
    else if (c === '"') {
      if (cur || closed) throw new Error("Ungültige Anführungszeichen in CSV.");
      quoted = true;
    } else if (closed) {
      if (c !== " " && c !== "\t") throw new Error("Ungültiger Inhalt nach CSV-Anführungszeichen.");
    } else cur += c;
  }
  if (quoted) throw new Error("Nicht geschlossenes Anführungszeichen in CSV.");
  finish();
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  if (head.some((h) => !h) || new Set(head).size !== head.length) throw new Error("CSV enthält leere oder doppelte Spaltenüberschriften.");
  return rows.slice(1).map((r, index) => {
    if (r.length !== head.length) throw new Error(`CSV-Zeile ${index + 2}: Anzahl der Felder stimmt nicht mit der Kopfzeile überein.`);
    return Object.fromEntries(head.map((h, i) => [h, r[i].trim()]));
  });
}
