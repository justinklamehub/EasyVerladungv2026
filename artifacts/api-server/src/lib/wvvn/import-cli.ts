import fs from "node:fs/promises";
import { pool } from "@workspace/db";
import { ensureWarehouseTables } from "../einlagerung/model";
import { ensureWvvnTables, transaction } from "./model";
import { commitImport, prepareImport } from "./import";

// Read literal data through the same preview and transactional import as the UI.
// Never pass the source to PostgreSQL/MySQL or execute it as a script.
async function main() {
  const [path, flag, previewHash] = process.argv.slice(2);
  if (!path) throw new Error("Aufruf: tsx src/lib/wvvn/import-cli.ts <datei.sql> [--commit <previewHash>]");
  const sql = await fs.readFile(path, "utf8");
  await ensureWarehouseTables();
  await ensureWvvnTables();
  const result = await transaction(async (c) => flag === "--commit"
    ? commitImport(c, sql, previewHash, "Datenübernahme")
    : (await prepareImport(c, sql)).preview);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
main().catch((error) => { process.stderr.write(String(error.message) + "\n"); process.exitCode = 1; }).finally(() => pool.end());
