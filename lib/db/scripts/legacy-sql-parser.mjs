// Read data literals only; never execute SQL supplied in a legacy export.
export function parseLegacySql(sql, allowed) {
  const tables = {};
  for (const match of sql.matchAll(/INSERT INTO `([^`]+)` \(([^)]+)\) VALUES\s*/g)) {
    const table = match[1];
    if (allowed && !allowed.has(table)) continue;
    const columns = [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    tables[table] ??= [];
    let row = [], value = "", quoted = false, wasString = false, inRow = false;
    const finish = () => {
      const v = value.trim();
      row.push(wasString ? value : v === "NULL" ? null : Number(v));
      value = ""; wasString = false;
    };
    for (let i = match.index + match[0].length; i < sql.length; i++) {
      const c = sql[i];
      if (quoted) {
        if (c === "\\") {
          const next = sql[++i];
          value += ({ n: "\n", r: "\r", t: "\t", "0": "\0" })[next] ?? next;
        } else if (c === "'" && sql[i + 1] === "'") { value += "'"; i++; }
        else if (c === "'") quoted = false;
        else value += c;
      } else if (c === "'") { quoted = true; wasString = true; value = ""; }
      else if (c === "(") { row = []; value = ""; inRow = true; }
      else if (c === ")" && inRow) {
        finish(); inRow = false;
        if (row.length !== columns.length || row.some((v) => typeof v === "number" && !Number.isFinite(v)))
          throw new Error(`Ungültiger SQL-Datensatz in ${table}`);
        tables[table].push(Object.fromEntries(columns.map((key, j) => [key, row[j]])));
      } else if (c === "," && inRow) finish();
      else if (c === ";" && !inRow) break;
      else if (inRow && (!wasString || !/\s/.test(c))) value += c;
    }
  }
  return tables;
}
