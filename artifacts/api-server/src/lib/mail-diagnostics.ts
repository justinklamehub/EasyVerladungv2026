import { accessSync, constants } from "node:fs";
import path from "node:path";

/** Resolve an executable, preserving PATH precedence but supporting service PATHs without /usr/sbin. */
export function findSendmailPath(
  searchPath = process.env.PATH ?? "",
  executable: (file: string) => boolean = (file) => {
    try { accessSync(file, constants.X_OK); return true; } catch { return false; }
  },
): string {
  const candidates = [
    ...searchPath.split(path.delimiter).filter((dir) => path.isAbsolute(dir)).map((dir) => path.join(dir, "sendmail")),
    "/usr/sbin/sendmail", "/usr/lib/sendmail", "/usr/bin/sendmail",
  ];
  for (const candidate of new Set(candidates)) {
    if (executable(candidate)) return candidate;
  }
  throw Object.assign(new Error("Lokales sendmail ist nicht vorhanden oder nicht ausführbar. Bitte SMTP in den E-Mail-Einstellungen konfigurieren oder die lokale Mailserver-Installation prüfen."), { code: "ENOENT" });
}

/** Fixed hints only: never expose raw SMTP responses, credentials or private paths. */
export function mailFailureHint(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  switch (code) {
    case "ENOENT":
      return "Lokales sendmail wurde nicht gefunden oder ist nicht ausführbar. Bitte SMTP in den E-Mail-Einstellungen konfigurieren oder die lokale Mailserver-Installation prüfen.";
    case "EAUTH":
      return "Der Mailserver hat die Anmeldung abgelehnt. Bitte SMTP-Zugang und die Freigabe des Kontos für SMTP prüfen.";
    case "ECONNREFUSED": case "ECONNECTION": case "ETIMEDOUT": case "ENOTFOUND": case "ENODATA":
      return "Der Mailserver ist nicht erreichbar. Bitte SMTP-Host, Port, DNS und Netzwerkfreigaben prüfen.";
    case "EENVELOPE":
      return "Der Mailserver hat Absender oder Empfänger abgelehnt. Bitte Adressen und Versandberechtigungen prüfen.";
    case "ESOCKET":
      return "Die Verbindung zum Mailserver ist fehlgeschlagen. Bitte Port, TLS-Zertifikat und Mailserver-Konfiguration prüfen.";
    default:
      return "Liefertermin-Mail konnte nicht gesendet werden. Empfänger und Mailserver prüfen; Details siehe Postausgang.";
  }
}
