import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SystemStatusCheck, SystemStatusReport } from "@workspace/api-zod";

type Result = Pick<SystemStatusCheck, "status" | "message" | "details">;
interface Dependencies {
  frontendDirectory: string;
  environment: SystemStatusReport["environment"];
  database: () => Promise<Result>;
  storage: () => Promise<Result>;
  timeoutMs?: number;
  cacheMs?: number;
}

export async function checkFrontend(directory: string): Promise<Result> {
  try {
    const index = path.join(directory, "index.html");
    const stat = await fs.stat(index);
    if (!stat.isFile() || stat.size === 0 || stat.size > 1024 * 1024) {
      return { status: "error", message: "Die Frontend-Einstiegsdatei ist leer oder ungültig.", details: [] };
    }
    const html = await fs.readFile(index, "utf8");
    if (!/\bid=["']root["']/.test(html)) {
      return { status: "error", message: "Die Einstiegsdatei enthält nicht das erwartete App-Frontend.", details: [] };
    }
    const resources = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
      .map((match) => match[1]).filter((value) => !/^(?:https?:|\/\/|data:)/i.test(value));
    if (!resources.some((value) => /\.(?:m?js)(?:[?#]|$)/.test(value))) {
      return { status: "error", message: "Kein gebautes JavaScript gefunden. Die Quelldatei ersetzt keinen Frontend-Build.", details: [] };
    }
    const missing: string[] = [];
    for (const resource of resources.slice(0, 30)) {
      const pathname = decodeURIComponent(new URL(resource, "http://frontend.invalid/").pathname);
      // Compiled assets may have an artifact base-path prefix.
      const assets = pathname.lastIndexOf("/assets/");
      const relative = assets >= 0 ? pathname.slice(assets + 1) : pathname.replace(/^\/+/, "");
      const target = path.resolve(directory, relative);
      if (!target.startsWith(path.resolve(directory) + path.sep)) {
        missing.push("Ungültiger Assetpfad");
        continue;
      }
      try {
        await fs.access(target, fs.constants.R_OK);
        if (!(await fs.stat(target)).isFile()) missing.push(relative);
      } catch { missing.push(relative); }
    }
    if (missing.length) return {
      status: "error", message: "Referenzierte Frontend-Dateien fehlen oder sind nicht lesbar.",
      details: missing.slice(0, 10).map((file) => `Betroffen: ${file}`),
    };
    return {
      status: "ok", message: "index.html und ihre lokalen Einstiegsskripte/Styles sind vorhanden und lesbar.",
      details: [`Build-Verzeichnis: ${directory}`, `Dateistand: ${stat.mtime.toISOString()}`,
        `${resources.length} lokale Referenzen gefunden. Dynamisch nachgeladene Module sind nicht vollständig geprüft.`],
    };
  } catch {
    return {
      status: "error", message: "Die gebaute index.html fehlt oder ist für den App-Dienst nicht lesbar.",
      details: [`Erwartetes Build-Verzeichnis: ${directory}`,
        "Frontend separat bauen und erst nach erfolgreicher Prüfung übernehmen. Keine Quelldatei als Ersatz kopieren."],
    };
  }
}

export async function checkLocalStorage(directory: string): Promise<Result> {
  try {
    if (!(await fs.stat(directory)).isDirectory()) throw new Error("not_directory");
    await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    const uploads = path.join(directory, "uploads");
    try {
      await fs.stat(uploads);
      if (!(await fs.stat(uploads)).isDirectory()) throw new Error("not_directory");
      await fs.access(uploads, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { status: "warning", message: "Bilderverzeichnis erreichbar; der Upload-Unterordner ist noch nicht angelegt.",
        details: [`Lokaler Speicher: ${directory}`, "Keine Dateien angelegt. Beim ersten Upload wird der Unterordner benötigt."] };
    }
    const capacity = await fs.statfs(directory);
    const freeBytes = capacity.bavail * capacity.bsize;
    const totalBytes = capacity.blocks * capacity.bsize;
    const low = freeBytes < 100 * 1024 * 1024 || (totalBytes > 0 && freeBytes / totalBytes < 0.05);
    return {
      status: low ? "warning" : "ok",
      message: low ? "Bilderablage erreichbar, aber wenig freier Speicherplatz." : "Lokale Bilderablage ist lesbar und die Zugriffsrechte erlauben Schreiben.",
      details: [`Lokaler Speicher: ${directory}`, `Freier Speicher: ${(freeBytes / 1024 ** 3).toFixed(2)} GiB`,
        "Rechte des laufenden App-Dienstes geprüft; kein Testbild geschrieben und keine Wiederherstellung geprüft."],
    };
  } catch {
    return { status: "error", message: "Bilderverzeichnis fehlt oder Lese-/Schreibzugriff ist nicht möglich.",
      details: ["Speicherpfad, Berechtigungen und eingebundenes Dateisystem prüfen. Es wurden keine Dateien verändert."] };
  }
}

export function createSystemStatusReader(dependencies: Dependencies) {
  const running = new Map<string, Promise<Result>>();
  let cached: { expires: number; report: SystemStatusReport } | undefined;
  let reportInFlight: Promise<SystemStatusReport> | undefined;
  async function probe(id: SystemStatusCheck["id"], title: string, task: () => Promise<Result>): Promise<SystemStatusCheck> {
    const start = Date.now();
    let operation = running.get(id);
    if (!operation) {
      operation = Promise.resolve().then(task);
      running.set(id, operation);
      const current = operation;
      void operation.then(() => { if (running.get(id) === current) running.delete(id); },
        () => { if (running.get(id) === current) running.delete(id); });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol("timeout");
    let result: Result;
    try {
      result = await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timedOut), dependencies.timeoutMs ?? 3000);
      })]);
    } catch (error) {
      result = { status: "error", message: error === timedOut ? "Die Prüfung hat nicht rechtzeitig geantwortet." : "Die Komponente konnte nicht erfolgreich geprüft werden.",
        details: ["Die Ursache im Serverprotokoll beziehungsweise in der Dienstkonfiguration prüfen. Zugangsdaten werden hier nicht ausgegeben."] };
    } finally { if (timer) clearTimeout(timer); }
    return { id, title, ...result, durationMs: Math.max(0, Date.now() - start) };
  }
  return async (): Promise<SystemStatusReport> => {
    if (cached && cached.expires > Date.now()) return cached.report;
    if (reportInFlight) return reportInFlight;
    reportInFlight = (async () => {
      const checks = await Promise.all([
        probe("frontend", "Frontend", async () => {
          const result = await checkFrontend(dependencies.frontendDirectory);
          if (dependencies.environment !== "production") {
            return { ...result, status: result.status === "error" ? "warning" : result.status,
              message: "Entwicklungs-/Testbetrieb: " + result.message,
              details: [...result.details, "Die laufende Vorschau wird zusätzlich im Browser geprüft; ein Build ist hier nicht Voraussetzung für den Betrieb."] };
          }
          return result;
        }),
        probe("api", "API", async () => ({ status: "ok", message: "Die geschützte Status-API antwortet auf diese Anfrage.",
          details: ["Dies bestätigt den aktuellen API-Aufruf, nicht sämtliche Fachfunktionen oder den Mailversand."] })),
        probe("database", "Datenbank", dependencies.database),
        probe("storage", "Bilderablage", dependencies.storage),
      ]);
      const report: SystemStatusReport = {
        checkedAt: new Date(),
        overall: checks.some((c) => c.status === "error") ? "error" : checks.some((c) => c.status === "warning") ? "warning" : "ok",
        environment: dependencies.environment, hostname: os.hostname(), nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()), checks,
      };
      cached = { expires: Date.now() + (dependencies.cacheMs ?? 5000), report };
      return report;
    })();
    try { return await reportInFlight; } finally { reportInFlight = undefined; }
  };
}
