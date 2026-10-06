import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { envelope, validate, mapCarriers, remapRecord, summary } from "./model.mjs";

export async function savePrivate(path, pack) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(pack), { flag: "wx", mode: 0o600 });
}

export async function checkTables(client) {
  for (const name of ["einlagerung_records", "einlagerung_datasets", "einlagerung_events", "settings", "speditionen"]) {
    const { rows } = await client.query("SELECT to_regclass($1) AS name", [name]);
    if (!rows[0].name) throw new Error(`Tabelle ${name} fehlt. Zuerst die aktuelle COMET-Version auf dem Server starten.`);
  }
}

export async function capture(client) {
  await checkTables(client);
  const records = (await client.query("SELECT id,kind,data,updated_at FROM einlagerung_records ORDER BY id")).rows;
  const datasets = (await client.query("SELECT id,type,filename,rows,row_count,imported_by,imported_at FROM einlagerung_datasets ORDER BY id")).rows;
  const events = (await client.query("SELECT id,username,action,detail,created_at FROM einlagerung_events ORDER BY id")).rows;
  const settings = (await client.query("SELECT value FROM settings WHERE key='einlagerung_settings'")).rows[0]?.value ?? null;
  const carrierIds = [...new Set(records.filter((r) => ["carrier", "reservation"].includes(r.kind))
    .map((r) => r.data.speditionId).filter((v) => v != null))];
  const carriers = (await client.query("SELECT id,name,kuerzel FROM speditionen WHERE id=ANY($1::int[]) ORDER BY id", [carrierIds])).rows;
  // Serialize timestamps exactly as they will appear in the downloadable JSON.
  const pack = envelope(JSON.parse(JSON.stringify({ exportedAt: new Date().toISOString(), records, datasets, events, settings, carriers })));
  validate(pack);
  return pack;
}

export async function exportSnapshot(client, file) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const pack = await capture(client);
    await savePrivate(file, pack);
    await client.query("COMMIT");
    return summary(pack.payload);
  } catch (e) { await client.query("ROLLBACK"); throw e; }
}

export async function importSnapshot(client, pack, { apply = false, backup, carrierMap = {} } = {}) {
  const p = validate(pack);
  if (apply && !backup) throw new Error("Beim Import ist --backup mit einem neuen Dateipfad Pflicht.");
  await client.query(apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await checkTables(client);
    if (apply) {
      await client.query("SET LOCAL lock_timeout='15s'");
      await client.query("SELECT pg_advisory_xact_lock(736291)");
      await client.query("LOCK TABLE einlagerung_records,einlagerung_datasets,einlagerung_events,settings IN ACCESS EXCLUSIVE MODE");
      await client.query("LOCK TABLE speditionen IN SHARE MODE");
    }
    const targetCarriers = (await client.query("SELECT id,name,kuerzel FROM speditionen ORDER BY id")).rows;
    const carriers = mapCarriers(p.carriers, targetCarriers, carrierMap);
    const current = await capture(client);
    const report = { quelle: summary(p), bisherigesZiel: summary(current.payload), speditionen: Object.fromEntries(carriers) };
    if (!apply) { await client.query("COMMIT"); return { pruefung: "OK – keine Änderung", ...report }; }
    // Exclusive creation prevents silently overwriting an earlier rollback backup.
    await savePrivate(backup, current);
    await client.query("DELETE FROM einlagerung_records");
    await client.query("DELETE FROM einlagerung_datasets");
    await client.query("DELETE FROM einlagerung_events");
    const ids = new Map();
    for (const r of p.records) {
      const { rows } = await client.query("INSERT INTO einlagerung_records(kind,data,updated_at) VALUES($1,$2,$3) RETURNING id",
        [r.kind, JSON.stringify(r.data), r.updated_at]);
      ids.set(r.id, rows[0].id);
    }
    for (const r of p.records)
      await client.query("UPDATE einlagerung_records SET data=$1 WHERE id=$2",
        [JSON.stringify(remapRecord(r, ids, carriers)), ids.get(r.id)]);
    for (const d of p.datasets)
      await client.query("INSERT INTO einlagerung_datasets(type,filename,rows,row_count,imported_by,imported_at) VALUES($1,$2,$3,$4,$5,$6)",
        [d.type, d.filename, JSON.stringify(d.rows), d.row_count, d.imported_by, d.imported_at]);
    for (const e of p.events)
      await client.query("INSERT INTO einlagerung_events(username,action,detail,created_at) VALUES($1,$2,$3,$4)",
        [e.username, e.action, e.detail, e.created_at]);
    if (p.settings === null) {
      await client.query("DELETE FROM settings WHERE key='einlagerung_settings'");
    } else {
      await client.query("INSERT INTO settings(key,value) VALUES('einlagerung_settings',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
        [p.settings]);
    }
    await client.query("COMMIT");
    return { import: "OK", sicherung: backup, ...report };
  } catch (e) { await client.query("ROLLBACK"); throw e; }
}
