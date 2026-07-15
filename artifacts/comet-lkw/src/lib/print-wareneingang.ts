function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDatum(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value + (value.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export interface WareneingangPrintData {
  lfdNr?: number | null;
  lkwid?: string | null;
  shipmentId?: number | null;
  anlieferungsdatum?: string | null;
  beauftrageSpedition?: string | null;
  ausfuehrendeSpedition?: string | null;
  kfzKennzeichen?: string | null;
  anzPaletten?: string | null;
  defektePaletten?: string | null;
  bemerkungen?: string | null;
  wareErhaltenDatum?: string | null;
  unterschrift?: string | null;
  druckbuchstaben?: string | null;
  eingereichtAt?: string | null;
}

export function printWareneingangProtokoll(data: WareneingangPrintData): void {
  const row = (label: string, value: string | null | undefined) =>
    `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value ?? "") || "—"}</td></tr>`;

  const sigHtml = data.unterschrift
    ? `<img src="${data.unterschrift}" style="max-width:240px;height:80px;object-fit:contain;border:1px solid #ccc;border-radius:4px;display:block;" />`
    : `<span style="color:#999">Keine Unterschrift</span>`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<title>Wareneingangsprotokoll</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #222; padding: 20mm 18mm; }
  h1 { font-size: 16pt; font-weight: bold; margin-bottom: 2mm; }
  .meta { font-size: 9pt; color: #666; margin-bottom: 6mm; }
  h2 { font-size: 11pt; font-weight: bold; background: #f0f0f0; padding: 4px 8px; margin: 6mm 0 2mm; border-left: 4px solid #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  td { padding: 4px 6px; border-bottom: 1px solid #e8e8e8; font-size: 10pt; vertical-align: top; }
  .lbl { width: 42%; color: #555; font-weight: 600; }
  .val { width: 58%; }
  .sig-block { margin-top: 4mm; }
  .sig-label { font-size: 9pt; color: #555; font-weight: 600; margin-bottom: 2mm; }
  .footer { margin-top: 12mm; font-size: 8pt; color: #aaa; text-align: center; border-top: 1px solid #e8e8e8; padding-top: 4mm; }
  @media print { body { padding: 15mm 12mm; } }
</style>
</head>
<body>
  <h1>Wareneingangsprotokoll</h1>
  <div class="meta">
    ${data.lfdNr != null ? `Lfd. Nr. <strong>${data.lfdNr}</strong> &nbsp;·&nbsp; ` : ""}
    ${data.eingereichtAt ? `Eingereicht: <strong>${new Date(data.eingereichtAt).toLocaleString("de-DE")}</strong>` : ""}
  </div>

  <h2>Kopfdaten</h2>
  <table>
    ${row("LKW-ID", data.lkwid ?? String(data.shipmentId ?? ""))}
    ${row("Anlieferungsdatum", formatDatum(data.anlieferungsdatum))}
    ${row("Beauftragte Spedition", data.beauftrageSpedition)}
    ${row("Ausführende Spedition", data.ausfuehrendeSpedition)}
    ${row("KFZ-Kennzeichen", data.kfzKennzeichen)}
  </table>

  <h2>Paletten</h2>
  <table>
    ${row("Anzahl Paletten", data.anzPaletten)}
    ${row("Defekte Paletten", data.defektePaletten)}
  </table>

  ${data.bemerkungen ? `<h2>Bemerkungen</h2><p style="font-size:10pt;padding:4px 6px;white-space:pre-wrap;">${esc(data.bemerkungen)}</p>` : ""}

  <h2>Ware erhalten</h2>
  <table>
    ${row("Datum", formatDatum(data.wareErhaltenDatum))}
    ${row("Name (Druckbuchstaben)", data.druckbuchstaben)}
  </table>
  <div class="sig-block">
    <div class="sig-label">Unterschrift</div>
    ${sigHtml}
  </div>

  <div class="footer">COMET LKW-Verladungsverwaltung · Wareneingangsprotokoll</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}
