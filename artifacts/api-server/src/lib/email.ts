import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { settingsTable, emailLogTable } from "@workspace/db";
import { eq, notLike, and } from "drizzle-orm";

export type EmailEvent = "shipment" | "bulk" | "user";

export interface ShipmentRow { label: string; value: string }
export interface BulkShipmentRow { bezeichnung: string; kennzeichen: string; spedition: string; status: string }

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function createTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return nodemailer.createTransport({ sendmail: true, newline: "unix" });
}

// ── HTML table: single shipment (label/value rows) ───────────────────────────

export function buildShipmentTableHtml(rows: ShipmentRow[]): string {
  const trs = rows
    .filter((r) => r.value)
    .map(
      (r) =>
        `<tr>
          <td style="border:1px solid #ddd;padding:7px 12px;font-weight:600;background:#f8f9fc;white-space:nowrap;color:#444">${r.label}</td>
          <td style="border:1px solid #ddd;padding:7px 12px;color:#222">${r.value}</td>
        </tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;margin:12px 0">${trs}</table>`;
}

export function buildShipmentTableText(rows: ShipmentRow[]): string {
  const filtered = rows.filter((r) => r.value);
  const maxLabel = Math.max(...filtered.map((r) => r.label.length));
  return filtered.map((r) => `  ${r.label.padEnd(maxLabel)}  ${r.value}`).join("\n");
}

// ── HTML table: bulk shipments (multi-column) ────────────────────────────────

export function buildBulkTableHtml(ships: BulkShipmentRow[]): string {
  const th = (t: string) =>
    `<th style="border:1px solid #ddd;padding:7px 12px;background:#f0f4ff;text-align:left;font-size:13px">${t}</th>`;
  const td = (t: string) =>
    `<td style="border:1px solid #ddd;padding:7px 12px;font-size:13px;color:#222">${t}</td>`;
  const header = `<tr>${[th("Bezeichnung"), th("Kennzeichen"), th("Spedition"), th("Status")].join("")}</tr>`;
  const bodyRows = ships
    .map((s) => `<tr>${[td(s.bezeichnung), td(s.kennzeichen), td(s.spedition), td(s.status)].join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;margin:12px 0"><thead>${header}</thead><tbody>${bodyRows}</tbody></table>`;
}

export function buildBulkTableText(ships: BulkShipmentRow[]): string {
  const cols = [
    ships.map((s) => s.bezeichnung),
    ships.map((s) => s.kennzeichen),
    ships.map((s) => s.spedition),
    ships.map((s) => s.status),
  ];
  const headers = ["Bezeichnung", "Kennzeichen", "Spedition", "Status"];
  const widths = headers.map((h, i) => Math.max(h.length, ...cols[i].map((v) => v.length)));
  const sep = widths.map((w) => "-".repeat(w + 2)).join("+");
  const headerRow = headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join("|");
  const dataRows = ships.map((s) => {
    const cells = [s.bezeichnung, s.kennzeichen, s.spedition, s.status];
    return cells.map((c, i) => ` ${c.padEnd(widths[i])} `).join("|");
  });
  return [sep, headerRow, sep, ...dataRows, sep].join("\n");
}

// ── Wrap body in HTML shell ──────────────────────────────────────────────────

function wrapHtml(subject: string, body: string): string {
  const bodyHtml = body
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p style="margin:4px 0">${line}</p>`))
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:700px;margin:0 auto;padding:24px">
  <h2 style="color:#1e3a5f;margin-bottom:16px">${subject}</h2>
  ${bodyHtml}
  </body></html>`;
}

// ── Main send function ───────────────────────────────────────────────────────

export async function sendEventEmail(
  event: EmailEvent,
  vars: Record<string, string>,
  extraTo?: string,
): Promise<void> {
  try {
    const settings = await getSettings();

    if (settings[`email_tpl_${event}_enabled`] !== "1") return;

    const from =
      settings.email_from ||
      process.env.SMTP_FROM ||
      "noreply@comet-seasonal.de";

    const configuredTo = (settings[`email_tpl_${event}_to`] ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (extraTo) configuredTo.push(extraTo);
    if (configuredTo.length === 0) return;

    const subject = interpolate(settings[`email_tpl_${event}_subject`] ?? "", vars);
    const textBody = interpolate(settings[`email_tpl_${event}_body`] ?? "", vars);

    if (!subject && !textBody) return;

    // For HTML: replace {{tabelle}} with the pre-built HTML table in vars
    // vars.tabelleHtml is the HTML version, vars.tabelle is the plain-text version
    const htmlBody = (settings[`email_tpl_${event}_body`] ?? "")
      .replace(/\{\{tabelle\}\}/g, vars.tabelleHtml ?? vars.tabelle ?? "")
      .replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");

    const transport = createTransport();
    let logStatus = "sent";
    let logError: string | null = null;
    try {
      await transport.sendMail({
        from,
        to: configuredTo.join(", "),
        subject,
        text: textBody,
        html: wrapHtml(subject, htmlBody),
      });
    } catch (sendErr) {
      logStatus = "error";
      logError = String(sendErr);
      console.error(`[email] Fehler beim Senden (${event}):`, sendErr);
    }
    try {
      await db.insert(emailLogTable).values({
        event,
        toAddresses: configuredTo.join(", "),
        subject,
        bodyHtml: htmlBody || null,
        bodyText: textBody || null,
        status: logStatus,
        errorMessage: logError,
      });
    } catch (logErr) {
      console.error("[email] Fehler beim Log-Eintrag:", logErr);
    }
  } catch (err) {
    console.error(`[email] Unerwarteter Fehler (${event}):`, err);
  }
}

// ── Seed default templates (run once on startup) ─────────────────────────────

export async function seedEmailTemplates(): Promise<void> {
  const defaults: Array<{ key: string; value: string }> = [
    { key: "email_from", value: "noreply-easy-verladung@comet-seasonal.de" },

    // Einzel-Verladung
    { key: "email_tpl_shipment_enabled", value: "" },
    { key: "email_tpl_shipment_to", value: "LFEGERCOMETLagerleitstand@comet-seasonal.de" },
    { key: "email_tpl_shipment_subject", value: "Neue Verladung angelegt: {{bezeichnung}}" },
    {
      key: "email_tpl_shipment_body",
      value: `Eine neue Verladung wurde im System angelegt.

{{tabelle}}

Diese E-Mail wurde automatisch generiert.`,
    },

    // Massen-Verladung
    { key: "email_tpl_bulk_enabled", value: "" },
    { key: "email_tpl_bulk_to", value: "LFEGERCOMETLagerleitstand@comet-seasonal.de" },
    { key: "email_tpl_bulk_subject", value: "{{anzahl}} Verladungen per Massenanlage erstellt" },
    {
      key: "email_tpl_bulk_body",
      value: `Es wurden {{anzahl}} Verladungen per Massenanlage angelegt ({{datum}}).

{{tabelle}}

Diese E-Mail wurde automatisch generiert.`,
    },

    // Benutzer angelegt
    { key: "email_tpl_user_enabled", value: "" },
    { key: "email_tpl_user_to", value: "LFEGERCOMETLagerleitstand@comet-seasonal.de" },
    { key: "email_tpl_user_subject", value: "Ihr Zugang wurde angelegt: {{username}}" },
    {
      key: "email_tpl_user_body",
      value: `Guten Tag {{username}},

Ihr Konto wurde im System COMET LKW-Verladungsverwaltung angelegt.

Benutzername:  {{username}}
E-Mail:        {{email}}
Passwort:      {{passwort}}
Rolle:         {{rolle}}
Spedition:     {{spedition}}

Bitte wenden Sie sich bei Fragen an Ihren Administrator.

Diese E-Mail wurde automatisch generiert.`,
    },
  ];

  for (const { key, value } of defaults) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoNothing();
  }

  // Migration: {{passwort}} in bestehende Benutzer-Vorlage einfügen falls noch nicht vorhanden
  await db
    .update(settingsTable)
    .set({
      value: `Guten Tag {{username}},

Ihr Konto wurde im System COMET LKW-Verladungsverwaltung angelegt.

Benutzername:  {{username}}
E-Mail:        {{email}}
Passwort:      {{passwort}}
Rolle:         {{rolle}}
Spedition:     {{spedition}}

Bitte wenden Sie sich bei Fragen an Ihren Administrator.

Diese E-Mail wurde automatisch generiert.`,
    })
    .where(
      and(
        eq(settingsTable.key, "email_tpl_user_body"),
        notLike(settingsTable.value, "%{{passwort}}%"),
      ),
    );
}
