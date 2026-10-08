// Only catalog entries may cross the private-log / public-status boundary.
export const phases = {
  prepare: "Voraussetzungen prüfen; laufende Dateien bleiben unverändert.",
  fetch: "Neue Version in einem getrennten Release-Verzeichnis vorbereiten.",
  dependencies: "Abhängigkeiten nur für die vorbereitete Version installieren.",
  backend: "Backend getrennt bauen und Syntax prüfen.",
  frontend: "Frontend getrennt bauen und alle Einstiegsskripte und Styles prüfen.",
  backup: "Datenbank und Bilder vor der Übernahme gemeinsam sichern.",
  restore: "Sicherung in einer isolierten Prüfdatenbank und Bildablage wiederherstellen.",
  promote: "Geprüftes Backend übernehmen und nur den eigenen API-Dienst neu starten.",
  delivery: "Frontend ohne fehlenden Dateipfad übernehmen und öffentliche Auslieferung prüfen.",
  finalize: "Geprüften Quellstand übernehmen; Sicherung und vorherige Builds bleiben erhalten.",
  complete: "Update, API-Prüfung, öffentliche Frontend-Prüfung und isolierte Wiederherstellungsprobe erfolgreich.",
};
const catalog = {
  ERR_PNPM_IGNORED_BUILDS: {
    cause: "pnpm hat benötigte Installationsskripte blockiert. Dadurch können Build-Werkzeuge wie esbuild fehlen.",
    nextSteps: [
      "Die paketbezogenen Build-Freigaben im vorgesehenen Git-Stand und ihre Kompatibilität mit der pnpm-Version des Servers prüfen; keine pauschale Skriptfreigabe erteilen.",
      "Die korrigierte Konfiguration committen und auf den Update-Branch pushen. Danach ein neues Update starten.",
      "Kein pnpm approve-builds und keine Installation im laufenden App-Verzeichnis ausführen.",
    ],
  },
  ERR_PNPM_OUTDATED_LOCKFILE: {
    cause: "Die Lockdatei passt nicht zu den Paketdefinitionen. Die Installation mit --frozen-lockfile wurde sicher abgebrochen.",
    nextSteps: [
      "Die Lockdatei außerhalb des laufenden Servers mit der vorgesehenen pnpm-Version an die Paketdefinitionen anpassen und den Build prüfen.",
      "Paketdefinitionen und Lockdatei gemeinsam committen und auf den Update-Branch pushen. Danach ein neues Update starten.",
      "--frozen-lockfile nicht abschalten und keine Installation im laufenden App-Verzeichnis ausführen.",
    ],
  },
  ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE: {
    cause: "Die Lockdatei ist mit der pnpm-Version des Servers nicht kompatibel. Die eingefrorene Installation wurde abgebrochen.",
    nextSteps: [
      "Die vorgesehene pnpm-Version mit der Serverversion abgleichen und eine kompatible Lockdatei außerhalb der laufenden Instanz erstellen und prüfen.",
      "Die korrigierten Projektdateien committen und auf den Update-Branch pushen. Danach ein neues Update starten.",
      "--frozen-lockfile beibehalten; keine Paketinstallation im laufenden App-Verzeichnis ausführen.",
    ],
  },
  UNKNOWN: {
    cause: "Der Update-Schritt ist fehlgeschlagen. Eine bekannte Ursache konnte nicht sicher erkannt werden.",
    nextSteps: [
      "Die angezeigte Abbruchphase und den Dienststatus prüfen. Das private Update-Protokoll bei Bedarf ausschließlich auf dem Server ansehen.",
      "Vor einem erneuten Update die Ursache beheben. Protokolle nicht ungeprüft teilen; sie können vertrauliche Angaben enthalten.",
    ],
  },
};
export function diagnosticFor(code, phase) {
  const safeCode = phase === "dependencies" && Object.hasOwn(catalog, code) ? code : "UNKNOWN";
  return { code: safeCode, ...catalog[safeCode], nextSteps: [...catalog[safeCode].nextSteps] };
}
export function classifyLine(line) {
  // Match pnpm's error marker, not arbitrary mentions embedded in a URL or token.
  const code = line.replace(/\x1b\[[0-9;]*m/g, "").match(/^\s*(?:[ \u2009])?(ERR_PNPM_[A-Z_]+)(?=\s|$)/)?.[1];
  return code && code !== "UNKNOWN" && Object.hasOwn(catalog, code) ? code : null;
}
export function safeMessage(status, phase, recovery) {
  if (status === "idle") return "Noch kein Update ausgeführt.";
  if (status === "queued") return "Update wird vorbereitet.";
  if (status === "unknown") return "Der Update-Abschluss ist nicht zuverlässig bekannt. Serverstatus und laufende Version manuell prüfen.";
  if (status === "failed") return recovery === "failed"
    ? "Update und automatische Rückkehr fehlgeschlagen. Dienst und öffentliche Auslieferung manuell prüfen; Datenbank nicht zurückgesetzt."
    : `Update in Phase ${phase} fehlgeschlagen. Vorherige Dateien beibehalten beziehungsweise zurückgenommen; Datenbank nicht zurückgesetzt.`;
  return phases[phase] || "Update wird ausgeführt.";
}
export function sanitizeUpdate(stored) {
  const status = ["idle", "queued", "running", "done", "failed", "unknown"].includes(stored.status) ? stored.status : "unknown";
  const phase = Object.hasOwn(phases, stored.phase) ? stored.phase : "";
  const recovery = status === "failed" ? (stored.recovery === "failed" ||
    stored.message === safeMessage("failed", phase, "failed") ? "failed" : "preserved") : null;
  const date = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? value : null;
  return {
    jobId: typeof stored.jobId === "string" && /^update-[a-zA-Z0-9_-]{1,100}$/.test(stored.jobId) ? stored.jobId : null,
    status, phase, message: safeMessage(status, phase, recovery), recovery,
    diagnostic: status === "failed" ? diagnosticFor(stored.diagnostic?.code, phase) : null,
    startedAt: date(stored.startedAt), finishedAt: date(stored.finishedAt),
    events: (Array.isArray(stored.events) ? stored.events : []).slice(-20).flatMap(event => {
      if (!event || !Object.hasOwn(phases, event.phase) || !date(event.at)) return [];
      return [{ phase: event.phase, message: phases[event.phase], at: date(event.at) }];
    }),
  };
}
