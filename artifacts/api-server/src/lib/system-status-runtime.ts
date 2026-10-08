import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { loadStorageConfig, objectStorageClient } from "./objectStorage";
import { checkLocalStorage, createSystemStatusReader } from "./system-status";

// The bundled entry lives in artifacts/api-server/dist. Independent of PM2's cwd.
const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../comet-lkw/dist/public");

export const readSystemStatus = createSystemStatusReader({
  frontendDirectory,
  environment: process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development",
  database: async () => {
    // pg supports per-query read timeouts; its QueryConfig type omits the field.
    const readiness = { text: "SELECT 1 AS ready", query_timeout: 2000 };
    await pool.query(readiness);
    // Read the table needed for settings/storage to catch missing schema as well.
    const settings = { text: "SELECT key FROM settings LIMIT 1", query_timeout: 2000 };
    await pool.query(settings);
    return { status: "ok", message: "PostgreSQL antwortet; die Einstellungstabelle ist lesbar.",
      details: ["Nur SELECT-Abfragen ausgeführt. Kein vollständiger Schema-, Schreib- oder Sicherungstest."] };
  },
  storage: async () => {
    const config = await loadStorageConfig(true);
    if (config.backend === "local") return checkLocalStorage(config.localDir);
    const privateDirectory = process.env.PRIVATE_OBJECT_DIR;
    const parts = privateDirectory?.replace(/^\/+/, "").split("/") ?? [];
    if (!parts[0] || parts.length < 2) return { status: "error", message: "Der Cloud-Bilderspeicher ist nicht vollständig konfiguriert.",
      details: ["Die private Speicherzuordnung prüfen. Konfigurationswerte und Zugangsdaten werden nicht ausgegeben."] };
    await objectStorageClient.bucket(parts[0]).getFiles({
      prefix: parts.slice(1).join("/") + "/", maxResults: 1, autoPaginate: false,
    });
    return { status: "ok", message: "Der Cloud-Bilderspeicher ist lesend erreichbar.",
      details: ["Nur Dateimetadaten abgefragt; keine Bilder gelesen oder verändert. Schreibfähigkeit und Wiederherstellung sind nicht getestet."] };
  },
});
