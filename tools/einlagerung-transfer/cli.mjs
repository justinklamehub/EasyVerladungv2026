#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportSnapshot, importSnapshot } from "./database.mjs";

const usage = `Aufruf aus dem COMET-Projektverzeichnis (Node.js 22, DATABASE_URL aus Server-.env):
node --env-file=.env tools/einlagerung-transfer/cli.mjs export --file /sicherer/pfad/stand.json
node --env-file=.env tools/einlagerung-transfer/cli.mjs check --file /sicherer/pfad/stand.json
node --env-file=.env tools/einlagerung-transfer/cli.mjs import --file /sicherer/pfad/stand.json --replace-einlagerung --backup /sicherer/pfad/vorher.json
Optional bei check/import: --carrier-map /sicherer/pfad/zuordnung.json
Import ERSETZT nur den gesamten Einlagerungsstand. Benutzer, Speditionen,
Verladungen und Palettenkonten werden nicht geändert. Zuerst check ausführen.
Keine Zugangsdaten in Befehle eingeben oder veröffentlichen.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") { console.log(usage); return; }
  if (!["export", "check", "import"].includes(command)) throw new Error(usage);
  const options = {};
  const allowed = command === "export" ? ["--file"] :
    command === "check" ? ["--file", "--carrier-map"] : ["--file", "--backup", "--carrier-map", "--replace-einlagerung"];
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || Object.hasOwn(options, key)) throw new Error(`Unbekannte/doppelte Option: ${key}`);
    if (key === "--replace-einlagerung") { options[key] = true; continue; }
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Wert für ${key} fehlt.`);
    options[key] = resolve(args[++i]);
  }
  if (!options["--file"]) throw new Error("--file fehlt.");
  if (command === "import" && (!options["--replace-einlagerung"] || !options["--backup"]))
    throw new Error("Import ersetzt den Einlagerungsstand. --replace-einlagerung und --backup sind Pflicht.");
  if (options["--backup"] === options["--file"]) throw new Error("Importdatei und Sicherungsdatei müssen verschieden sein.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt. Server-.env über --env-file laden, keine Zugangsdaten hier eingeben.");
  // Resolve the existing pg dependency; no extra package installation is needed.
  const require = createRequire(resolve("lib/db/package.json"));
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, application_name: "comet-einlagerung-transfer" });
  try {
    const pack = command !== "export" ? JSON.parse(await readFile(options["--file"], "utf8")) : null;
    const carrierMap = options["--carrier-map"] ? JSON.parse(await readFile(options["--carrier-map"], "utf8")) : {};
    await client.connect();
    const result = command === "export" ? await exportSnapshot(client, options["--file"]) :
      await importSnapshot(client, pack, { apply: command === "import", backup: options["--backup"], carrierMap });
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.end(); }
}

main().catch((error) => {
  // Connection errors can embed URLs; never print raw database error details.
  const safe = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "28P01", "28000", "3D000"].includes(error.code);
  console.error(safe ? `Datenbankverbindung fehlgeschlagen (${error.code}). Server-Konfiguration prüfen.` :
    String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[Datenbankadresse ausgeblendet]"));
  process.exitCode = 1;
});
