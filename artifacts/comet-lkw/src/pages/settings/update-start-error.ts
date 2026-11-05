export interface UpdateStartError {
  message: string;
  kind: "rejected" | "unknown";
}

// Do not expose arbitrary response bodies: proxy/server errors can contain secrets.
const serverReasons = new Map<string, string>([
  ["Update nur aus der konfigurierten App-Herkunft starten.", "Der Server akzeptiert die Herkunft der Anfrage nicht. COMET_PUBLIC_URL, die verwendete Browseradresse und die Weiterleitung des Origin-Headers abgleichen."],
  ["System-Anzeige- und Update-Recht erforderlich.", "Für deinen Benutzer fehlen System-Anzeige- oder Update-Rechte."],
  ["Das Update muss ausdrücklich bestätigt werden.", "Der Server hat die erforderliche Update-Bestätigung nicht erhalten."],
  ["Server-Updates sind nur für selbstgehostete Produktionsinstanzen eingerichtet.", "Server-Updates sind nur für selbstgehostete Produktionsinstanzen eingerichtet."],
  ["Der sichere Updater ist auf diesem Server noch nicht installiert.", "Der sichere Updater ist auf diesem Server noch nicht installiert."],
  ["Der sichere Updater ist auf diesem Server nicht installiert.", "Der sichere Updater ist auf diesem Server nicht installiert."],
  ["COMET_PUBLIC_URL für die öffentliche Auslieferungsprüfung ist noch nicht konfiguriert.", "COMET_PUBLIC_URL für die öffentliche Auslieferungsprüfung ist noch nicht konfiguriert."],
  ["Die API muss als unprivilegierter App-Benutzer laufen.", "Die API muss als unprivilegierter App-Benutzer laufen."],
  ["Für den sicheren Updater wird Node.js 22 oder neuer benötigt.", "Für den sicheren Updater wird Node.js 22 oder neuer benötigt."],
  ["Update-Status zuerst auf dem Server prüfen.", "Der gespeicherte Update-Status ist nicht zuverlässig lesbar und muss auf dem Server geprüft werden."],
]);

export function describeUpdateStartError(error: unknown): UpdateStartError {
  const response = error && typeof error === "object" ? error as { status?: unknown; data?: unknown } : {};
  const status = typeof response.status === "number" ? response.status : null;
  const data = response.data && typeof response.data === "object" ? response.data as { error?: unknown } : {};
  if (status === 401) return { kind: "rejected", message: "Der neue Update-Auftrag wurde nicht angenommen: Deine Anmeldung ist abgelaufen. Bitte erneut anmelden." };
  if (status === 409) return { kind: "rejected", message: "Neuer Update-Auftrag abgelehnt (HTTP 409): Die Update-Sperre ist belegt. Wenn darunter nur ein alter abgeschlossener Auftrag steht, muss die Sperre auf dem Server geprüft werden. Die Sperrdatei nicht löschen und kein zweites Update erzwingen." };
  if ([400, 403, 503].includes(status ?? 0) && typeof data.error === "string") {
    const reason = serverReasons.get(data.error);
    if (reason) return { kind: "rejected", message: `Neuer Update-Auftrag abgelehnt (HTTP ${status}): ${reason}` };
  }
  return {
    kind: "unknown",
    message: `Start konnte nicht bestätigt werden${status ? ` (HTTP ${status})` : ""}. Erst den gespeicherten Serverstatus prüfen, bevor du erneut startest. Ein alter abgeschlossener Auftrag bestätigt diesen neuen Start nicht.`,
  };
}
