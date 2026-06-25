const PRINT_ITEMS = [
  { id: 1,  text: "zwei plombierte Feuerlöscher (min. 6 kg) mit Prüfdatum" },
  { id: 2,  text: "mind. zwei Unterlegkeile" },
  { id: 3,  text: "Fahrzeugkennzeichnung (Warntafel und Gefahrzettel)" },
  { id: 4,  text: "zwei selbststehende Warnzeichen (z.B. Warndreieck + Warnblinkleuchte)" },
  { id: 5,  text: "eine geeignete Warnweste oder Warnkleidung (nach Norm EN 471)" },
  { id: 6,  text: "keine sichtbaren Mängel am Fahrzeug (Reifen, Beleuchtung)" },
  { id: 7,  text: "gültige Fahrerlaubnis (Fahrer + ggf. Beifahrer)" },
  { id: 8,  text: "Lichtbildausweis (Fahrer + ggf. Beifahrer)" },
  { id: 9,  text: "ADR\u2013Schein mit Eintrag der Klasse 1 \u2013 gültig bis:", specialInput: "adr" },
  { id: 10, text: "Zusammenladungsverbot beachtet" },
  { id: 11, text: "Ladungssicherung mit geeigneten Mitteln durchgeführt" },
  { id: 12, text: "Beförderungspapier" },
  { id: 13, text: "neue schriftliche Weisung gem. ADR 2023 an Bord?" },
  { id: 14, text: "Fahrzeug verschlussfähig" },
  { id: 15, text: "auf Rauchverbot im Fahrerhaus hingewiesen (auch E-Zigaretten)" },
  { id: 16, text: "Plombe(n) übergeben mit der/den Nr.:", specialInput: "plomben" },
  { id: 17, text: "\u201cLadung auf LKW\u201d mit Foto dokumentiert" },
];

export interface GefahrgutPrintData {
  kennzeichen?: string | null;
  anhaenger?: string | null;
  spedition?: string | null;
  nameFahrer?: string | null;
  unterschriftFahrer?: string | null;
  nameVerlader?: string | null;
  unterschriftVerlader?: string | null;
  datum?: string | null;
  items?: Record<string, unknown>;
  vonCometEuropaletten?: number | null;
  vonCometLadungssicherung?: number | null;
  vonDefektePaletten?: number | null;
  anCometEuropaletten?: number | null;
  anCometLadungssicherung?: number | null;
  anDefektePaletten?: number | null;
  bemerkungen?: string | null;
  shipmentId?: number | null;
  ladelistennummer?: string | null;
  logoUrl?: string | null;
}

function formatAdrDate(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const parts = value.split("-");
  if (parts.length === 2) return `${parts[1]}.${parts[0]}`;
  return value;
}

function formatDatum(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value + (value.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function cb(checked: boolean): string {
  return checked ? "&#9746;" : "&#9744;";
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printGefahrgutCheckliste(data: GefahrgutPrintData): void {
  const items = data.items ?? {};
  const adrDate = formatAdrDate(items["9_adr"]);
  const plombenNr = items["16_plomben"] ? String(items["16_plomben"]) : "";

  const vonEuro  = data.vonCometEuropaletten  ?? 0;
  const vonLasich = data.vonCometLadungssicherung ?? 0;
  const vonDef   = data.vonDefektePaletten    ?? 0;
  const anEuro   = data.anCometEuropaletten   ?? 0;
  const anLasich = data.anCometLadungssicherung ?? 0;
  const anDef    = data.anDefektePaletten     ?? 0;

  const rows = PRINT_ITEMS.map((item) => {
    const bChecked = !!items[`${item.id}_b`];
    const vChecked = !!items[`${item.id}_v`];
    let textHtml = esc(item.text);
    if (item.specialInput === "adr" && adrDate) {
      textHtml += ` <strong><u>${esc(adrDate)}</u></strong>`;
    }
    if (item.specialInput === "plomben" && plombenNr) {
      textHtml += ` <strong>${esc(plombenNr)}</strong>`;
    }
    return `<tr>
      <td style="text-align:center;width:30px;padding:2px 3px;font-size:12pt;">${cb(bChecked)}</td>
      <td style="text-align:center;width:30px;padding:2px 3px;font-size:12pt;">${cb(vChecked)}</td>
      <td style="padding:3px 6px;font-size:8.5pt;line-height:1.35;">${textHtml}</td>
    </tr>`;
  }).join("\n");

  const sigFahrerHtml = data.unterschriftFahrer
    ? `<img src="${data.unterschriftFahrer}" style="height:52px;max-width:160px;object-fit:contain;display:block;" />`
    : `<div style="height:52px;border-bottom:1px solid #555;width:140px;margin-top:4px;"></div>`;

  const sigVerladerHtml = data.unterschriftVerlader
    ? `<img src="${data.unterschriftVerlader}" style="height:52px;max-width:160px;object-fit:contain;display:block;" />`
    : `<div style="height:52px;border-bottom:1px solid #555;width:140px;margin-top:4px;"></div>`;

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" style="max-width:110px;max-height:60px;object-fit:contain;display:block;" alt="Logo" />`
    : `<div class="logo-x">&#10005;</div>
       <div class="logo-name">COMET SEASONAL</div>
       <div class="logo-sub">COMPANY</div>`;

  const ladelisteVal = data.ladelistennummer
    ? `<strong>${esc(data.ladelistennummer)}</strong>${data.shipmentId ? `<br><span style="font-size:7.5pt;color:#555;">LKW-ID: ${data.shipmentId}</span>` : ""}`
    : (data.shipmentId ? `<span style="font-size:8pt;color:#555;">LKW-ID: ${data.shipmentId}</span>` : "—");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>FB LOG-016 \u2013 Checkliste Gefahrguttransporte</title>
<style>
@page { size: A4 portrait; margin: 11mm 13mm; }
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;background:#fff;}
.outer{border:2px solid #000;}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;padding:7px 10px 5px;border-bottom:2px solid #000;gap:10px;}
.hdr-left h1{font-size:15pt;font-weight:900;line-height:1.1;}
.hdr-left p{font-size:8.5pt;color:#333;margin-top:2px;}
.logo{border:2px solid #000;padding:4px 7px;text-align:center;min-width:88px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.logo-x{font-size:20pt;font-weight:900;line-height:1;}
.logo-name{font-size:6.5pt;font-weight:700;letter-spacing:.05em;white-space:nowrap;}
.logo-sub{font-size:5.5pt;color:#555;}
.meta{display:flex;border-bottom:1.5px solid #000;}
.meta-l{flex:1;padding:5px 8px;border-right:1.5px solid #000;}
.meta-r{flex:1;padding:5px 8px;}
.meta-lbl{font-weight:700;font-size:8.5pt;text-decoration:underline;margin-bottom:2px;}
.meta-val{font-size:8pt;line-height:1.45;}
table.cl{width:100%;border-collapse:collapse;}
table.cl th{font-weight:700;font-size:8.5pt;padding:3px 4px;border-bottom:1.5px solid #000;text-align:center;background:#f0f0f0;}
table.cl th:last-child{text-align:left;padding-left:6px;}
table.cl tr{border-bottom:.5px solid #ccc;}
table.cl tr:last-child{border-bottom:none;}
.note{border-top:1.5px solid #000;padding:5px 9px;font-size:7.5pt;line-height:1.4;background:#f8f8f8;}
.sig-sec{border-top:1.5px solid #000;padding:6px 10px;}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:7px;}
.sig-lbl{font-size:8.5pt;font-weight:700;margin-bottom:2px;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;}
.info-item{font-size:8.5pt;}
.info-item b{font-weight:700;}
.pal-sec{border-top:1.5px solid #000;padding:6px 10px;}
.pal-title{font-weight:700;font-size:9pt;text-decoration:underline;margin-bottom:4px;}
.pal-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:8.5pt;}
.pal-sub{color:#333;margin-top:1px;}
.rem-sec{border-top:1.5px solid #000;padding:6px 10px;min-height:32px;}
.rem-title{font-weight:700;font-size:9pt;text-decoration:underline;margin-bottom:4px;}
.rem-body{font-size:8.5pt;min-height:20px;white-space:pre-wrap;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
</head>
<body>
<div class="outer">

<div class="hdr">
  <div class="hdr-left">
    <h1>Sicherheitspflichten - FB LOG - 016</h1>
    <p>Checkliste Gefahrguttransporte</p>
  </div>
  <div class="logo">
    ${logoHtml}
  </div>
</div>

<div class="meta">
  <div class="meta-l">
    <div class="meta-lbl">Ladestelle</div>
    <div class="meta-val">COMET Feuerwerk GmbH<br>Überseering 22<br>27580 Bremerhaven</div>
  </div>
  <div class="meta-r">
    <div class="meta-lbl">Umlagerungsnr. / Ladelistennr.</div>
    <div class="meta-val">${ladelisteVal}</div>
  </div>
</div>

<table class="cl">
  <thead>
    <tr>
      <th style="width:30px;">(B)</th>
      <th style="width:30px;">(V)</th>
      <th style="text-align:left;padding-left:6px;">Beschreibung</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>

<div class="note">
  <strong>Bemerkung:</strong><br>
  Die Verladerpflichten sind mit (V), die Pflichten des Beförderers und des Fahrzeugführers sind mit (B) gekennzeichnet!
</div>

<div class="sig-sec">
  <div class="sig-grid">
    <div>
      <div class="sig-lbl">Name Fahrer: ${esc(data.nameFahrer)}</div>
      <div class="sig-lbl" style="margin-top:5px;">Unterschrift:</div>
      <div style="margin-top:4px;">${sigFahrerHtml}</div>
    </div>
    <div>
      <div class="sig-lbl">Name Verlader: ${esc(data.nameVerlader)}</div>
      <div class="sig-lbl" style="margin-top:5px;">Unterschrift:</div>
      <div style="margin-top:4px;">${sigVerladerHtml}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-item"><b>Kennzeichen:</b> ${esc(data.kennzeichen)}</div>
    <div class="info-item"><b>Datum:</b> ${esc(formatDatum(data.datum))}</div>
    <div class="info-item"><b>ggf. Anhänger:</b> ${esc(data.anhaenger)}</div>
    <div class="info-item"><b>Spedition:</b> ${esc(data.spedition)}</div>
  </div>
</div>

<div class="pal-sec">
  <div class="pal-title">Europaletten</div>
  <div class="pal-grid">
    <div>
      <div><strong>Angeliefert:</strong> ${vonEuro} Paletten</div>
      <div class="pal-sub">davon defekt: ${vonDef} Paletten</div>
      <div class="pal-sub">LS: ${vonLasich} Paletten</div>
    </div>
    <div>
      <div><strong>Verladen:</strong> ${anEuro} Paletten</div>
      <div class="pal-sub">davon defekt: ${anDef} Paletten</div>
      <div class="pal-sub">LS: ${anLasich} Paletten</div>
    </div>
  </div>
</div>

<div class="rem-sec">
  <div class="rem-title">Sonstige Bemerkungen:</div>
  <div class="rem-body">${esc(data.bemerkungen)}</div>
</div>

</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=820,height=960,scrollbars=yes");
  if (!win) {
    alert("Bitte Pop-ups für diese Seite erlauben, um die PDF-Ansicht zu öffnen.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}
