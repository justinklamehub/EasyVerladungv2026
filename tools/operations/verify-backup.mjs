import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { atomicJson, operations, requireDb, assertUnprivileged, hash, run, tableCounts, safeRelative, postgresBinaries } from "./common.mjs";

export async function verifyBackup(folder) {
  assertUnprivileged();
  const manifest = JSON.parse(await fs.readFile(path.join(folder, "manifest.json"), "utf8"));
  if (manifest.format !== "comet-backup-v1") throw new Error("Unbekanntes Sicherungsformat.");
  // A failed recheck must not leave the same backup marked as verified.
  const summary = path.join(operations, "backup.json");
  let current;
  try { current = JSON.parse(await fs.readFile(summary, "utf8")); } catch { /* standalone check */ }
  if (current?.id === manifest.id) await atomicJson(summary, { ...current, verifiedAt: null });
  await atomicJson(path.join(folder, "verification.json"), { verifiedAt: null, databaseRestored: false, imagesRestored: false });
  const dump = safeRelative(folder, manifest.database.relative);
  if (await hash(dump) !== manifest.database.sha256) throw new Error("Datenbanksicherung beschädigt.");
  for (const image of manifest.images) {
    const source = safeRelative(folder, image.relative);
    if (await hash(source) !== image.sha256 || (await fs.stat(source)).size !== image.bytes) throw new Error("Gesichertes Bild beschädigt.");
  }
  await run("pg_restore", ["--list", dump]);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "comet-restore-"));
  await fs.chmod(temporary, 0o700);
  let server, client;
  // Restore never connects to DATABASE_URL. Only this private Unix socket is used.
  const env = { PATH: process.env.PATH, HOME: temporary, TMPDIR: temporary, LANG: "C.UTF-8",
    PGHOST: temporary, PGPORT: "5432", PGUSER: os.userInfo().username, PGDATABASE: "postgres",
    PGPASSFILE: path.join(temporary, "no-password-file"), PGSSLMODE: "disable" };
  try {
    const binaries = await postgresBinaries();
    await run(path.join(binaries, "initdb"), ["-D", path.join(temporary, "pg"), "-A", "trust", "--no-locale", "--encoding=UTF8"], { env });
    server = spawn(path.join(binaries, "postgres"), ["-D", path.join(temporary, "pg"), "-k", temporary,
      "-c", "listen_addresses=", "-c", "fsync=on"], { env, stdio: "ignore" });
    const { Client } = requireDb("pg");
    let connected = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      client = new Client({ host: temporary, port: 5432, user: env.PGUSER, database: "postgres", connectionTimeoutMillis: 1000 });
      try { await client.connect(); connected = true; break; }
      catch { await client.end().catch(() => {}); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (!connected) throw new Error("Isolierte Prüfdatenbank konnte nicht gestartet werden.");
    const location = (await client.query("SHOW data_directory")).rows[0].data_directory;
    if (await fs.realpath(location) !== await fs.realpath(path.join(temporary, "pg"))) throw new Error("Prüfdatenbank ist nicht isoliert.");
    const connection = `host=${temporary} port=5432 user=${env.PGUSER} dbname=postgres sslmode=disable`;
    await run("pg_restore", ["--exit-on-error", "--clean", "--if-exists", "--no-owner", "--no-acl",
      `--dbname=${connection}`, dump], { env });
    const actual = await tableCounts(client);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.tables)) throw new Error("Wiederhergestellte Tabellen/Zeilenzahlen stimmen nicht überein.");
    const restored = path.join(temporary, "images");
    await fs.mkdir(restored, { mode: 0o700 });
    for (const image of manifest.images) {
      const source = safeRelative(folder, image.relative);
      if (await hash(source) !== image.sha256 || (await fs.stat(source)).size !== image.bytes) throw new Error("Gesichertes Bild beschädigt.");
      const target = image.source === "local" ? safeRelative(restored, image.original) : safeRelative(restored, image.relative);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.copyFile(source, target);
      if (await hash(target) !== image.sha256) throw new Error("Wiederhergestelltes Bild stimmt nicht überein.");
    }
    const proof = { verifiedAt: new Date().toISOString(), imageCount: manifest.images.length,
      tableCount: actual.length, databaseRestored: true, imagesRestored: true,
      limitations: "Isoliertes PostgreSQL und lokale Bilddateien. Keine Live-Rückspielung, Cloud-Uploads, App-Anmeldung oder Funktionsprüfung." };
    await atomicJson(path.join(folder, "verification.json"), proof);
    try { current = JSON.parse(await fs.readFile(summary, "utf8")); } catch { /* standalone check */ }
    if (current?.id === manifest.id) await atomicJson(summary, { ...current, verifiedAt: proof.verifiedAt });
    return proof;
  } finally {
    await client?.end().catch(() => {});
    if (server) {
      server.kill("SIGTERM");
      await new Promise(resolve => { server.once("exit", resolve); setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000).unref(); });
    }
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] === import.meta.filename) {
  try {
    if (process.argv[2] === "--check-tools") { await postgresBinaries(); console.log("Passende PostgreSQL-Serverwerkzeuge vorhanden."); }
    else { await verifyBackup(path.resolve(process.argv[2])); console.log("Datenbank und Bilddateien in isolierter Umgebung erfolgreich wiederhergestellt und geprüft."); }
  }
  catch { console.error("Wiederherstellungsprüfung fehlgeschlagen. Laufende Datenbank und Bilderablage wurden nicht überschrieben."); process.exitCode = 1; }
}
