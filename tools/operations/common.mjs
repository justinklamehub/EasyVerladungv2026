import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

export const root = path.resolve(import.meta.dirname, "../..");
export const app = path.resolve(process.env.COMET_APP_DIR || root);
export const operations = path.join(app, ".comet-operations");
export const requireDb = createRequire(path.join(root, "lib/db/package.json"));
export const requireApi = createRequire(path.join(root, "artifacts/api-server/package.json"));

export function assertUnprivileged() {
  if (process.getuid?.() === 0) throw new Error("Als App-Benutzer ausführen, nicht als root.");
}
export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const next = `${file}.${process.pid}.tmp`;
  await fs.writeFile(next, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(next, file);
}
export async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    child.stdout.on("data", chunk => { if (output.length < 1024 * 1024) output += chunk; });
    // Never send command stderr, connection strings or database contents to the UI.
    child.stderr.resume();
    child.once("error", () => reject(new Error(`${command} konnte nicht gestartet werden.`)));
    child.once("close", code => code === 0 ? resolve(output) : reject(new Error(`${command} fehlgeschlagen (Code ${code}).`)));
  });
}
export function pgEnvironment(connectionString) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PostgreSQL-Verbindung erforderlich.");
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
  for (const [key, variable] of Object.entries({ host: "PGHOST", port: "PGPORT", user: "PGUSER", dbname: "PGDATABASE",
    password: "PGPASSWORD", connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME",
    sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT",
    sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", options: "PGOPTIONS" })) {
    if (url.searchParams.has(key)) env[variable] = url.searchParams.get(key);
  }
  return env;
}
export const quote = value => `"${value.replaceAll('"', '""')}"`;
export async function tableCounts(client) {
  const tables = await client.query(`SELECT n.nspname AS schema, c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','m') AND n.nspname NOT LIKE 'pg_%'
    AND n.nspname <> 'information_schema' ORDER BY 1,2`);
  const counts = [];
  for (const table of tables.rows) {
    const result = await client.query(`SELECT count(*)::text AS count FROM ${quote(table.schema)}.${quote(table.name)}`);
    counts.push({ ...table, count: result.rows[0].count });
  }
  return counts;
}
export function safeRelative(base, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("Ungültiger Sicherungspfad.");
  const target = path.resolve(base, relative);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error("Sicherungspfad verlässt das Sicherungsverzeichnis.");
  return target;
}
export async function postgresBinaries() {
  const major = (await run("pg_dump", ["--version"])).match(/PostgreSQL\)\s+(\d+)/)?.[1];
  const candidates = process.env.COMET_PG_BIN ? [process.env.COMET_PG_BIN] : [...(process.env.PATH || "").split(path.delimiter)];
  if (!process.env.COMET_PG_BIN) {
    try { candidates.push((await run("pg_config", ["--bindir"])).trim()); } catch { /* optional, absent on Nix */ }
    try {
      for (const version of await fs.readdir("/usr/lib/postgresql")) {
        if (/^\d+$/.test(version)) candidates.push(`/usr/lib/postgresql/${version}/bin`);
      }
    } catch { /* not a Debian installation */ }
    if (major) candidates.push(`/usr/pgsql-${major}/bin`);
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      for (const name of ["initdb", "postgres", "pg_dump", "pg_restore"]) await fs.access(path.join(candidate, name), fs.constants.X_OK);
      const version = (await run(path.join(candidate, "postgres"), ["--version"])).match(/PostgreSQL\)\s+(\d+)/)?.[1];
      if (version === major) return candidate;
    } catch { /* try the next matching installation */ }
  }
  throw new Error("Passende PostgreSQL-Serverwerkzeuge fehlen. COMET_PG_BIN konfigurieren.");
}
