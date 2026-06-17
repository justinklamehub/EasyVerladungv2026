import { format } from "date-fns";
import { de } from "date-fns/locale";
import QRCode from "qrcode";

export interface DeckblattData {
  shipmentId: number;
  bezeichnung?: string | null;
  kennzeichen?: string | null;
  relation?: string | null;
  lkwArt?: string | null;
  etaDate?: string | null;
  etaTime?: string | null;
  tor?: string | null;
  status?: string | null;
  bemerkungen?: string | null;
  speditionName?: string | null;
  username: string;
}

function formatLkwId(shipmentId: number): string {
  const year = new Date().getFullYear();
  return `R${year}${String(shipmentId).padStart(4, "0")}`;
}

function formatEta(etaDate?: string | null, etaTime?: string | null): string {
  if (!etaDate) return "—";
  try {
    const d = format(new Date(etaDate), "dd.MM.yyyy", { locale: de });
    return etaTime ? `${d}  ${etaTime} Uhr` : d;
  } catch {
    return etaDate;
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function printDeckblatt(data: DeckblattData) {
  const now = new Date();
  const printTs = format(now, "dd.MM.yyyy HH:mm:ss", { locale: de });
  const lkwId = formatLkwId(data.shipmentId);
  const eta = formatEta(data.etaDate, data.etaTime);

  const codeValue = String(data.shipmentId);
  const qrDataUrl = await QRCode.toDataURL(codeValue, {
    width: 200,
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  /*
   * Seitenaufbau — alle Höhen explizit in mm, Summe = 297mm
   *   Header  :  30mm
   *   Content : 260mm  (padding 4+4mm innen, nutzbar 252mm)
   *   Footer  :   7mm
   *   Gesamt  : 297mm
   *
   * Innerhalb Content (252mm nutzbar):
   *   Spedition          : 11mm
   *   gap+divider        :  4mm
   *   Kennzeichen-Zeile  : 12mm
   *   gap+divider        :  4mm
   *   Relation/ETA-Zeile : 18mm
   *   gap+divider        :  4mm
   *   Bemerkungen        : 16mm
   *   gap+divider        :  4mm
   *   Paletten           : 14mm
   *   gap                :  3mm
   *   Zeichenkasten      : 162mm   ← Rest
   *   Summe              : 252mm ✓
   */

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>Deckblatt ${lkwId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
      size: A4 portrait;
      margin: 0;
    }

    body {
      font-family: 'Arial', 'Helvetica Neue', sans-serif;
      width: 210mm;
      height: 297mm;
      background: #fff;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      overflow: hidden;
    }

    /* ── PAGE: feste Höhe, drei Reihen ──────────────── */
    .page {
      width: 210mm;
      height: 297mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ── HEADER  30mm ───────────────────────────────── */
    .header {
      height: 30mm;
      background: #f1f5f9;
      padding: 4mm 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6mm;
      flex-shrink: 0;
      overflow: hidden;
    }

    .lkw-id-badge {
      background: #c0392b;
      border-radius: 3mm;
      padding: 3mm 7mm;
      text-align: center;
      flex-shrink: 0;
    }

    .lkw-id-label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #fca5a5;
      margin-bottom: 1mm;
    }

    .lkw-id-value {
      font-size: 26pt;
      font-weight: 900;
      color: #fff;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1mm;
      flex-shrink: 0;
    }

    .qr-label {
      font-size: 5.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
    }

    .qr-img {
      width: 20mm;
      height: 20mm;
      display: block;
    }

    /* ── CONTENT  218mm ─────────────────────────────── */
    .content {
      height: 218mm;
      flex-shrink: 0;
      padding: 4mm 14mm;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow: hidden;
    }

    /* ── FIELD ──────────────────────────────────────── */
    .field-label {
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 0.5mm;
    }

    .field-value {
      font-size: 13pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.15;
      word-break: break-word;
      overflow: hidden;
    }

    .field-value.xl    { font-size: 24pt; line-height: 1.05; }
    .field-value.large { font-size: 15pt; }

    .field-value.empty {
      color: #cbd5e1;
      font-weight: 400;
      font-style: italic;
    }

    /* ── SEKTIONEN MIT FIXER HÖHE ───────────────────── */
    .sec-spedition      { height: 11mm; overflow: hidden; flex-shrink: 0; }
    .sec-kennzeichen    { height: 12mm; overflow: hidden; flex-shrink: 0; }
    .sec-relation       { height: 18mm; overflow: hidden; flex-shrink: 0; }
    .sec-bemerkungen    { height: 16mm; overflow: hidden; flex-shrink: 0; }
    .sec-paletten       { height: 14mm; overflow: hidden; flex-shrink: 0; }
    .sec-zeichenkasten  { height: 120mm; overflow: hidden; flex-shrink: 0; }

    /* ── GAP + DIVIDER ──────────────────────────────── */
    .gap-divider {
      height: 4mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .gap-divider-inner {
      height: 0.25mm;
      background: #e2e8f0;
    }

    .gap-only { height: 3mm; flex-shrink: 0; }

    /* ── GRID ───────────────────────────────────────── */
    .row { display: flex; gap: 6mm; height: 100%; }
    .col { flex: 1; overflow: hidden; }
    .col-2 { flex: 2; overflow: hidden; }
    .col-auto { flex: none; min-width: 26mm; overflow: hidden; }

    /* ── BEMERKUNGEN ────────────────────────────────── */
    .bemerkungen-box {
      background: #f8fafc;
      border: 0.3mm solid #e2e8f0;
      border-radius: 2mm;
      padding: 2mm 4mm;
      height: 10mm;
      overflow: hidden;
    }

    .bemerkungen-text {
      font-size: 9pt;
      color: #1e293b;
      line-height: 1.35;
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* ── PALETTEN ───────────────────────────────────── */
    .paletten-row {
      display: flex;
      align-items: stretch;
      border: 0.6mm solid #0f172a;
      border-radius: 2mm;
      height: 100%;
    }

    .paletten-label-cell {
      padding: 2mm 5mm;
      border-right: 0.6mm solid #0f172a;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 48mm;
    }

    .paletten-label-text {
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0f172a;
      line-height: 1.2;
    }

    .paletten-writein-cell {
      flex: 1;
      padding: 2mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 3mm;
    }

    .writein-line {
      height: 0.3mm;
      background: #334155;
      opacity: 0.25;
    }

    /* ── ZEICHENKASTEN ──────────────────────────────── */
    .zeichenkasten {
      border: 0.6mm solid #0f172a;
      border-radius: 2mm;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .zeichenkasten-header {
      background: #0f172a;
      color: #f1f5f9;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      padding: 1.5mm 5mm;
      flex-shrink: 0;
    }

    .zeichenkasten-body {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .zeichenkasten-body::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right,  #e2e8f0 0.25mm, transparent 0.25mm),
        linear-gradient(to bottom, #e2e8f0 0.25mm, transparent 0.25mm);
      background-size: 10mm 10mm;
    }

    .zeichenkasten-inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2mm;
      pointer-events: none;
      user-select: none;
    }


    /* ── FOOTER  7mm ────────────────────────────────── */
    .footer {
      height: 7mm;
      flex-shrink: 0;
      border-top: 0.25mm solid #e2e8f0;
      padding: 0 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 7pt;
      color: #94a3b8;
      overflow: hidden;
    }

    @media print {
      html, body { width: 210mm; height: 297mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER 30mm -->
  <div class="header">
    <div class="lkw-id-badge">
      <div class="lkw-id-label">LKW-ID</div>
      <div class="lkw-id-value">${escHtml(codeValue)}</div>
    </div>
    <div class="qr-wrap">
      <div class="qr-label">QR</div>
      <img src="${qrDataUrl}" alt="QR ${lkwId}" class="qr-img" />
    </div>
  </div>

  <!-- CONTENT 260mm -->
  <div class="content">

    <!-- Spedition 11mm -->
    <div class="sec-spedition">
      <div class="field-label">Spedition</div>
      <div class="field-value large ${!data.speditionName ? "empty" : ""}">
        ${data.speditionName ? escHtml(data.speditionName.toUpperCase()) : "Nicht zugewiesen"}
      </div>
    </div>

    <div class="gap-divider"><div class="gap-divider-inner"></div></div>

    <!-- Kennzeichen + Bezeichnung + Tor 12mm -->
    <div class="sec-kennzeichen">
      <div class="row">
        <div class="col">
          <div class="field-label">Kennzeichen</div>
          <div class="field-value large ${!data.kennzeichen ? "empty" : ""}">
            ${data.kennzeichen ? escHtml(data.kennzeichen) : "—"}
          </div>
        </div>
        <div class="col">
          <div class="field-label">Bezeichnung</div>
          <div class="field-value large ${!data.bezeichnung ? "empty" : ""}">
            ${data.bezeichnung ? escHtml(data.bezeichnung) : "—"}
          </div>
        </div>
        <div class="col-auto">
          <div class="field-label">Tor</div>
          <div class="field-value large ${!data.tor ? "empty" : ""}">
            ${data.tor ? escHtml(data.tor) : "—"}
          </div>
        </div>
      </div>
    </div>

    <div class="gap-divider"><div class="gap-divider-inner"></div></div>

    <!-- Relation + ETA 18mm -->
    <div class="sec-relation">
      <div class="row">
        <div class="col-2">
          <div class="field-label">Relation / Leitgebiet</div>
          <div class="field-value xl ${!data.relation ? "empty" : ""}">
            ${data.relation ? escHtml(data.relation) : "—"}
          </div>
        </div>
        <div class="col">
          <div class="field-label">Voraussichtl. Ankunft</div>
          <div class="field-value large ${!data.etaDate ? "empty" : ""}">
            ${escHtml(eta)}
          </div>
        </div>
      </div>
    </div>

    <div class="gap-divider"><div class="gap-divider-inner"></div></div>

    <!-- Bemerkungen 16mm -->
    <div class="sec-bemerkungen">
      <div class="field-label">Bemerkungen</div>
      <div class="bemerkungen-box">
        <div class="bemerkungen-text ${!data.bemerkungen ? "empty" : ""}">
          ${data.bemerkungen ? escHtml(data.bemerkungen) : "Keine Bemerkungen"}
        </div>
      </div>
    </div>

    <div class="gap-divider"><div class="gap-divider-inner"></div></div>

    <!-- Anzahl Paletten 14mm -->
    <div class="sec-paletten">
      <div class="paletten-row">
        <div class="paletten-label-cell">
          <div class="paletten-label-text">Anzahl<br/>Paletten</div>
        </div>
        <div class="paletten-writein-cell">
          <div class="writein-line"></div>
          <div class="writein-line"></div>
        </div>
      </div>
    </div>

    <div class="gap-only"></div>

    <!-- Zeichenkasten 162mm -->
    <div class="sec-zeichenkasten">
      <div class="zeichenkasten">
        <div class="zeichenkasten-header">Palettenstand — Skizze (Draufsicht)</div>
        <div class="zeichenkasten-body"></div>
      </div>
    </div>

  </div><!-- /content -->

  <!-- FOOTER 7mm -->
  <div class="footer">
    <span>Ausdruck vom ${escHtml(printTs)} Uhr</span>
    <span>${escHtml(data.username)}</span>
  </div>

</div><!-- /page -->
<script>
  window.onload = function () {
    window.print();
    window.onafterprint = function () { window.close(); };
  };
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    alert("Popup wurde blockiert. Bitte Popup-Blocker für diese Seite deaktivieren.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
