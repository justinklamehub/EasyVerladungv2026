import { classifyDeliveryOrders, DEADLINE_TIME_ZONE, deadlineSummary, todayOrdinal } from "@workspace/api-zod/delivery-deadlines";
import type { EinlagerungDeadlineThresholds } from "@workspace/api-zod";
import { DEFAULT_DELIVERY_MAIL_SUBJECT, DEFAULT_DELIVERY_MAIL_BODY, DEFAULT_DELIVERY_MAIL_DAYS,
  DEFAULT_DELIVERY_MAIL_SCOPE, DELIVERY_MAIL_SCOPE_OPTIONS, type DeliveryMailScope } from "@workspace/api-zod/delivery-mail";

export const reportDate = (now: Date) => String(todayOrdinal(now));
export const reportClock = (now: Date) => new Intl.DateTimeFormat("en-GB", {
  timeZone: DEADLINE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(now);
export const validReportTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function reportRecipients(value: string) {
  const addresses = [...new Set(value.split(/[,;]/).map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (!addresses.length || addresses.some((v) => !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v))) {
    throw new Error("Bitte gültige Empfängeradressen angeben (durch Komma oder Semikolon getrennt).");
  }
  return addresses;
}
export function reportIsDue(settings: Record<string, string>, now: Date) {
  const time = settings.report_delivery_time || "07:00";
  return settings.report_delivery_enabled === "1" && validReportTime(time) && reportClock(now) >= time;
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const labels: Record<string, string> = { critical: "Kritisch / überfällig", soon: "Bald fällig", upcoming: "Demnächst", safe: "Unkritisch", unknown: "Termin prüfen", week: "KW-Termin" };

export function buildDeliveryReport(input: {
  orders: Record<string, any>[]; thresholds: EinlagerungDeadlineThresholds; now: Date; appName: string;
  importedAt?: Date; filename?: string; staleHours: number; warningDays?: number; subjectTemplate?: string; bodyTemplate?: string; scope?: DeliveryMailScope;
}) {
  const allRows = classifyDeliveryOrders(input.orders, input.thresholds, input.now);
  const scope = input.scope ?? DEFAULT_DELIVERY_MAIL_SCOPE;
  const rows = allRows.filter((r) => scope === "all" || r.status === "critical" || (scope === "urgent" && r.status === "soon"));
  const sum = deadlineSummary(rows);
  const warningDays = input.warningDays ?? DEFAULT_DELIVERY_MAIL_DAYS;
  const dueCount = rows.filter((r) => r.days != null && r.days <= warningDays).length;
  const date = input.now.toLocaleString("de-DE", { timeZone: DEADLINE_TIME_ZONE });
  const stand = input.importedAt ? `${input.importedAt.toLocaleString("de-DE", { timeZone: DEADLINE_TIME_ZONE })} (${input.filename || ""})` : "Kein Auftragsimport vorhanden";
  const stale = input.importedAt && input.now.getTime() - input.importedAt.getTime() > input.staleHours * 3_600_000;
  const unknownCount = allRows.filter((r) => r.status === "unknown").length;
  const warnings = [stale ? "Achtung: Der Auftragsimport ist veraltet." : "", unknownCount ? `${unknownCount} Termine fehlen oder sind ungültig; bitte in der Lagerübersicht prüfen.` : ""].filter(Boolean);
  const scopeLabel = DELIVERY_MAIL_SCOPE_OPTIONS.find((o) => o.value === scope)!.label;
  const explanation = `Mail-Inhalt: ${scopeLabel}. Versand nur, wenn mindestens ein enthaltener Termin ${warningDays} Tage Rest oder weniger hat, einschließlich heute und überfällig. Resttage sind Kalendertage (${DEADLINE_TIME_ZONE}). KW-Termine: maßgeblich ist der Montag / KW-Beginn. Plus-KW wird nur angezeigt und verlängert den Termin nicht. Unabhängige Lagerwarnstufen: kritisch ≤ ${input.thresholds.criticalDays} Tage, bald fällig ≤ ${input.thresholds.soonDays}, demnächst ≤ ${input.thresholds.upcomingDays}.`;
  const headers = ["Status", "Liefertermin / KW", "Rest", "Regal", "Spedition", "Relation", "Plus-KW", "Paletten"];
  const cells = rows.map((r) => [
    labels[r.status], r.dateLabel,
    r.days == null ? "–" : `${r.days < 0 ? `${-r.days} Tage überfällig` : r.days === 0 ? "Heute" : `${r.days} Tage`}${r.dateLabel.startsWith("KW ") ? " (KW-Beginn: Montag)" : ""}`,
    r.order.shelf, r.order.spedition, r.order.relation, r.order.plusKw, r.order.paletten,
  ]);
  const pallets = rows.reduce((n, r) => n + (Number(r.order.paletten) || 0), 0);
  const summary = `${rows.length} Auftragsgruppen / ${pallets} Paletten; ${dueCount} innerhalb der Mail-Frist von ${warningDays} Tagen oder überfällig; ${sum.critical.orders} laut Lagerwarnung kritisch.`;
  const tableText = [headers.join(" | "), ...cells.map((c) => c.map((v) => String(v ?? "")).join(" | "))].join("\n");
  const tableHtml = `<table style="border-collapse:collapse;width:100%"><thead><tr>${headers.map((h) => `<th style="border:1px solid #ddd;padding:8px;text-align:left">${escape(h)}</th>`).join("")}</tr></thead><tbody>${cells.map((c, i) => `<tr style="background:${rows[i].days != null && rows[i].days! <= warningDays ? "#fef2f2" : "#fff"}">${c.map((v) => `<td style="border:1px solid #ddd;padding:8px">${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const vars: Record<string, string> = { app_name: input.appName, datum: input.now.toLocaleDateString("de-DE", { timeZone: DEADLINE_TIME_ZONE }),
    pruefzeit: date, faellige_anzahl: String(dueCount), kritische_anzahl: String(sum.critical.orders), anzahl: String(rows.length), paletten: String(pallets),
    tage_vor_liefertermin: String(warningDays), zusammenfassung: summary, importstand: stand, hinweise: warnings.join("\n"), erklaerung: explanation };
  const interpolate = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
  const subject = interpolate(input.subjectTemplate || DEFAULT_DELIVERY_MAIL_SUBJECT, vars).replace(/[\r\n]+/g, " ").slice(0, 500);
  const body = input.bodyTemplate || DEFAULT_DELIVERY_MAIL_BODY;
  const includesTable = /\{\{tabelle\}\}/.test(body);
  const text = interpolate(body, { ...vars, tabelle: tableText }) + (includesTable ? "" : `\n\n${tableText}`);
  const htmlBody = interpolate(escape(body), { ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escape(v)])), tabelle: tableHtml }).replace(/\r?\n/g, "<br>");
  const html = `<html lang="de"><body style="font-family:Arial,sans-serif;color:#172033"><h2>${escape(subject)}</h2>${htmlBody}${includesTable ? "" : `<br><br>${tableHtml}`}</body></html>`;
  return { subject, html, text, criticalCount: sum.critical.orders, ordersCount: rows.length, dueCount, warningDays };
}

// Persist each successful recipient before proceeding, so retries skip delivered mail.
export async function deliverReportRecipients(
  report: ReturnType<typeof buildDeliveryReport>, recipients: string[], delivered: string[], from: string,
  send: (message: { from: string; to: string; subject: string; text: string; html: string }) => Promise<{ rejected?: unknown[] }>,
  recordSent: (to: string) => Promise<void>,
) {
  for (const to of recipients.filter((r) => !delivered.includes(r))) {
    const result = await send({ from, to, subject: report.subject, text: report.text, html: report.html });
    if (result.rejected?.length) throw new Error("Der Mailserver hat einen Empfänger abgelehnt.");
    await recordSent(to);
  }
}
