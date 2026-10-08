import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, operations, requireApi, requireDb, assertUnprivileged, atomicJson, hash, run, pgEnvironment, tableCounts } from "./common.mjs";

export async function createBackup(destination) {
  assertUnprivileged();
  if (!process.env.DATABASE_URL) throw new Error("Datenbankverbindung fehlt.");
  const { Client } = requireDb("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const folder = path.resolve(destination);
  const records = [];
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
    const settings = (await client.query("SELECT key,value FROM settings WHERE key IN ('storage_backend','storage_local_path')")).rows;
    const config = Object.fromEntries(settings.map(row => [row.key, row.value]));
    const backend = config.storage_backend || process.env.STORAGE_BACKEND || "gcs";
    let localDirectory;
    if (backend === "local") {
      localDirectory = await fs.realpath(path.resolve(process.env.COMET_STORAGE_CWD || app,
        config.storage_local_path || process.env.LOCAL_STORAGE_DIR || "storage-data"));
      // Resolve even a not-yet-created destination through its nearest real ancestor.
      // A symlink alias must not permit database dumps inside the live picture store.
      const tail = [];
      let ancestor = folder, resolved;
      while (!resolved) {
        try { resolved = await fs.realpath(ancestor); }
        catch (error) {
          if (error.code !== "ENOENT") throw error;
          tail.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor);
        }
      }
      const physicalDestination = path.join(resolved, ...tail);
      if (physicalDestination === localDirectory || physicalDestination.startsWith(localDirectory + path.sep)) {
        throw new Error("Sicherung darf nicht in der Bilderablage liegen.");
      }
    }
    await fs.mkdir(path.dirname(folder), { recursive: true, mode: 0o700 });
    await fs.mkdir(folder, { mode: 0o700 }); // Never overwrite an existing backup.
    const counts = await tableCounts(client);
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot}`,
      `--file=${path.join(folder, "database.dump")}`], { env: pgEnvironment(process.env.DATABASE_URL) });
    await fs.chmod(path.join(folder, "database.dump"), 0o600);
    await fs.mkdir(path.join(folder, "images"), { mode: 0o700 });
    const add = async (source, original, metadata, copy) => {
      const relative = `images/${String(records.length).padStart(8, "0")}.bin`;
      const target = path.join(folder, relative);
      await copy(target);
      await fs.chmod(target, 0o600);
      const stat = await fs.stat(target);
      records.push({ relative, source, original, metadata, bytes: stat.size, sha256: await hash(target) });
    };
    if (backend === "local") {
      const scan = async (base, prefix = "") => {
        const entries = await fs.readdir(base, { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          const file = path.join(base, entry.name);
          const relative = path.posix.join(prefix, entry.name);
          if (entry.isSymbolicLink()) throw new Error("Symlinks in der Bilderablage müssen vorher geklärt werden.");
          if (entry.isDirectory()) await scan(file, relative);
          else if (entry.isFile()) {
            const before = await fs.stat(file);
            await add("local", relative, null, target => fs.copyFile(file, target));
            const after = await fs.stat(file);
            if (before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
                await hash(file) !== records.at(-1).sha256) throw new Error("Bild während der Sicherung verändert.");
          } else throw new Error("Nicht unterstützter Dateityp in der Bilderablage.");
        }
      };
      await scan(localDirectory);
    } else if (backend === "gcs") {
      const { Storage } = requireApi("@google-cloud/storage");
      const sidecar = "http://127.0.0.1:1106";
      const storage = new Storage({ projectId: "", credentials: {
        audience: "replit", subject_token_type: "access_token", token_url: `${sidecar}/token`,
        type: "external_account", credential_source: { url: `${sidecar}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
        universe_domain: "googleapis.com",
      } });
      const prefixes = [process.env.PRIVATE_OBJECT_DIR, ...(process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",")]
        .filter(value => value?.trim()).map(value => value.trim().replace(/^\/+|\/+$/g, ""));
      if (!prefixes.length || !process.env.PRIVATE_OBJECT_DIR) throw new Error("Cloud-Speicherzuordnung fehlt.");
      const seen = new Set();
      for (const prefix of prefixes) {
        const [bucket, ...parts] = prefix.split("/");
        if (!bucket || !parts.length) throw new Error("Ungültige Cloud-Speicherzuordnung.");
        // Streaming pagination does not limit a backup to the first page.
        for await (const file of storage.bucket(bucket).getFilesStream({ prefix: parts.join("/") + "/" })) {
          const key = `${bucket}/${file.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const [metadata] = await file.getMetadata();
          const version = storage.bucket(bucket).file(file.name, { generation: metadata.generation });
          await add("gcs", key, { generation: metadata.generation, contentType: metadata.contentType,
            cacheControl: metadata.cacheControl, metadata: metadata.metadata ?? {} },
          target => version.download({ destination: target, validation: "crc32c" }));
        }
      }
    } else throw new Error("Nicht unterstützte Bilderablage.");
    await client.query("COMMIT");
    const database = { relative: "database.dump", sha256: await hash(path.join(folder, "database.dump")) };
    const manifest = { format: "comet-backup-v1", id: randomUUID(), createdAt: new Date().toISOString(), backend,
      consistency: "PostgreSQL-Snapshot; unveränderte lokale Dateien bzw. feste Cloud-Generationen. Keine globale DB-/Speichertransaktion.",
      database, tables: counts, images: records };
    await atomicJson(path.join(folder, "manifest.json"), manifest); // This is the completion marker.
    await atomicJson(path.join(operations, "backup.json"), { id: manifest.id, createdAt: manifest.createdAt,
      imageCount: records.length, tableCount: counts.length, backend, verifiedAt: null });
    return folder;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // Leave the private incomplete folder for inspection; never mark it completed.
    throw error;
  } finally { await client.end().catch(() => {}); }
}
if (process.argv[1] === import.meta.filename) {
  try {
    const folder = process.argv[2] || path.join(process.env.COMET_BACKUP_DIR || path.join(path.dirname(app), "backups"),
      `comet-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
    await createBackup(folder);
    console.log("Datenbank und Bilder gemeinsam gesichert. Wiederherstellungsprüfung steht noch aus.");
  } catch (error) { console.error(error.message.startsWith("pg_") ? error.message : "Sicherung fehlgeschlagen; keine abgeschlossene Sicherung markiert."); process.exitCode = 1; }
}
