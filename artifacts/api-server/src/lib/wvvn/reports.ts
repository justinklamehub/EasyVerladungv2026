import { pool } from "@workspace/db";
import { createEmailTransport } from "../email";
import { logger } from "../logger";
import { audit, buildCsv, settings, transaction, WvvnError } from "./model";

export function recipients(input: string) {
  const list = [...new Set(input.split(/[;,\n]/).map((s) => s.trim()).filter(Boolean))];
  if (list.some((s) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))) throw new WvvnError("Bitte gültige E-Mail-Adressen mit Komma oder Semikolon trennen.");
  return list;
}
export function berlinNow(now = new Date()) {
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const time = now.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time };
}
// A separate session advisory lock spans enqueue+SMTP. Report snapshots and assignments
// are committed before SMTP, so uncertain delivery is never automatically duplicated.
export async function sendReports(manual = false, actor = "Automatik") {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(743169) AS locked")).rows[0].locked;
    if (!acquired) return { message: "Ein Berichtsversand läuft bereits." };
    const s = await settings(lock);
    if (!manual && !s.mailEnabled) return { message: "Automatischer Versand ist deaktiviert." };
    const { date, time } = berlinNow();
    if (!manual && time < s.mailTime) return { message: "Versandzeit noch nicht erreicht." };
    let sent = 0;
    for (const mode of ["WERKSVERKAUF", "VERNICHTUNG"]) {
      const to = recipients(mode === "WERKSVERKAUF" ? s.salesRecipients : s.destructionRecipients);
      if (!to.length) {
        if (manual) throw new WvvnError(`Kein Empfänger für ${mode === "WERKSVERKAUF" ? "Werksverkauf" : "Vernichtung"} eingestellt.`);
        continue;
      }
      const r = await transaction(async (c) => {
        // Failed SMTP rejections are retryable. Uncertain sends require human review.
        const pending = await c.query("SELECT * FROM wvvn_reports WHERE mode=$1 AND status IN ('pending','failed') ORDER BY id LIMIT 1", [mode]);
        if (pending.rowCount) return pending.rows[0];
        if (!manual && (await c.query("SELECT 1 FROM wvvn_reports WHERE mode=$1 AND report_date=$2 AND legacy_id IS NULL", [mode, date])).rowCount) return null;
        const closed = await c.query("SELECT id FROM wvvn_sessions WHERE status='done' AND legacy_id IS NULL AND report_id IS NULL AND mode=$1 ORDER BY id", [mode]);
        if (!closed.rowCount) return null;
        const ids = closed.rows.map((row) => row.id);
        const rows = await c.query(`SELECT i.*,s.netto,s.kware FROM wvvn_items i JOIN wvvn_sessions s ON s.id=i.session_id
          WHERE s.id=ANY($1::integer[]) AND i.deleted_at IS NULL ORDER BY i.id`, [ids]);
        const runningNo = Number((await c.query("SELECT COALESCE(MAX(running_no),0)+1 AS n FROM wvvn_reports WHERE mode=$1", [mode])).rows[0].n);
        const r = await c.query(`INSERT INTO wvvn_reports(mode,report_date,running_no,status,csv)
          VALUES($1,$2,$3,'pending',$4) RETURNING *`, [mode, date, runningNo, buildCsv(rows.rows)]);
        await c.query("UPDATE wvvn_sessions SET report_id=$1 WHERE id=ANY($2::integer[])", [r.rows[0].id, ids]);
        await audit(c, actor, "Tagesbericht erstellt", `${mode} Nr. ${runningNo}, ${ids.length} abgeschlossene Listen. Noch nicht gemeldete Abschlüsse werden unabhängig vom Kalendertag erfasst.`);
        return r.rows[0];
      });
      if (!r) continue;
      const appSettings = Object.fromEntries((await lock.query("SELECT key,value FROM settings WHERE key LIKE 'smtp_%' OR key='email_from'")).rows.map((row) => [row.key, row.value ?? ""]));
      const from = appSettings.email_from || process.env.SMTP_FROM;
      if (!from) {
        await lock.query("UPDATE wvvn_reports SET status='failed',error=$2 WHERE id=$1", [r.id, "Kein Absender in den zentralen E-Mail-Einstellungen hinterlegt."]);
        if (manual) throw new WvvnError("Bitte zunächst den zentralen E-Mail-Absender konfigurieren.");
        continue;
      }
      await lock.query("UPDATE wvvn_reports SET status='sending',error='' WHERE id=$1", [r.id]);
      const transport = createEmailTransport(appSettings);
      try {
        const info = await transport.sendMail({
          from, to, subject: `${mode} (${r.report_date}) Nr. ${r.running_no}`,
          text: `Anbei der Bericht ${mode} Nr. ${r.running_no}.\nEr enthält alle bisher noch nicht gemeldeten abgeschlossenen Listen bis zum Versandzeitpunkt. Spätere Abschlüsse erscheinen im nächsten Bericht.\n`,
          attachments: [{ filename: `${mode}_${r.report_date}_Nr${r.running_no}.csv`, content: Buffer.from(r.csv, "utf8"), contentType: "text/csv; charset=utf-8" }],
        });
        if (info.rejected?.length) throw Object.assign(new Error("Mindestens ein Empfänger wurde abgelehnt; Zustellung an weitere Empfänger ist möglicherweise erfolgt."), { uncertain: true });
        await lock.query("UPDATE wvvn_reports SET status='sent',sent_at=now(),error='' WHERE id=$1", [r.id]);
        await audit(lock, actor, "Tagesbericht versendet", `${mode} Nr. ${r.running_no}`);
        sent++;
      } catch (error: any) {
        const safelyRejected = !error.uncertain && (Number(error.responseCode) >= 400 || ["ECONNECTION", "EDNS", "EAUTH"].includes(error.code));
        await lock.query("UPDATE wvvn_reports SET status=$2,error=$3 WHERE id=$1", [r.id, safelyRejected ? "failed" : "uncertain",
          safelyRejected ? "Mailserver hat den Versand abgelehnt. Zentrale E-Mail-Konfiguration prüfen; erneuter Versuch möglich." :
            "Zustellung unklar. Vor einem erneuten Versand Mailserver und Empfänger prüfen; keine automatische Wiederholung."]);
        logger.error({ reportId: r.id, errorCode: error.code, responseCode: error.responseCode }, "WVVN report delivery failed");
        if (manual) throw new WvvnError("Versand fehlgeschlagen oder Zustellung unklar. Details stehen beim Bericht.", 502);
      } finally { transport.close(); }
    }
    return { message: sent ? `${sent} Bericht(e) versendet.` : "Keine neuen abgeschlossenen Listen zu versenden." };
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(743169)");
    lock.release();
  }
}
