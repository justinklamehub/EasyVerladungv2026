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

    .page {
      width: 210mm;
      height: 297mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── HEADER ─────────────────────────────────────── */
    .header {
      background: #f1f5f9;
      padding: 7mm 14mm 6mm 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6mm;
      flex-shrink: 0;
    }

    .lkw-id-badge {
      background: #c0392b;
      border-radius: 3mm;
      padding: 4mm 8mm;
      text-align: center;
      flex-shrink: 0;
    }

    .lkw-id-label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #fca5a5;
      margin-bottom: 1.5mm;
    }

    .lkw-id-value {
      font-size: 30pt;
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
      width: 22mm;
      height: 22mm;
      display: block;
    }

    /* ── CONTENT ────────────────────────────────────── */
    .content {
      flex: 1;
      min-height: 0;
      padding: 4mm 14mm 4mm 14mm;
      display: flex;
      flex-direction: column;
      gap: 3mm;
    }

    /* ── FIELD ──────────────────────────────────────── */
    .field-label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 1mm;
    }

    .field-value {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
      word-break: break-word;
    }

    .field-value.xl    { font-size: 26pt; line-height: 1.05; }
    .field-value.large { font-size: 16pt; }
    .field-value.std   { font-size: 13pt; }

    .field-value.empty {
      color: #cbd5e1;
      font-weight: 400;
      font-style: italic;
    }

    /* ── GRID ───────────────────────────────────────── */
    .row { display: flex; gap: 6mm; }
    .col { flex: 1; }
    .col-2 { flex: 2; }
    .col-auto { flex: none; min-width: 28mm; }

    /* ── DIVIDER ────────────────────────────────────── */
    .divider {
      height: 0.25mm;
      background: #e2e8f0;
    }

    /* ── BEMERKUNGEN ────────────────────────────────── */
    .bemerkungen-box {
      background: #f8fafc;
      border: 0.3mm solid #e2e8f0;
      border-radius: 2mm;
      padding: 3mm 5mm;
      min-height: 9mm;
    }

    .bemerkungen-text {
      font-size: 9.5pt;
      color: #1e293b;
      line-height: 1.4;
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* ── PALETTEN WRITEIN ───────────────────────────── */
    .paletten-row {
      display: flex;
      align-items: stretch;
      border: 0.6mm solid #0f172a;
      border-radius: 2mm;
      min-height: 14mm;
      flex-shrink: 0;
    }

    .paletten-label-cell {
      padding: 3mm 5mm;
      border-right: 0.6mm solid #0f172a;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 50mm;
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
      padding: 3mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 4mm;
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
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .zeichenkasten-header {
      background: #0f172a;
      color: #f1f5f9;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      padding: 2mm 5mm;
    }

    .zeichenkasten-body {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Grid-Hintergrund */
    .zeichenkasten-body::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right,  #e2e8f0 0.25mm, transparent 0.25mm),
        linear-gradient(to bottom, #e2e8f0 0.25mm, transparent 0.25mm);
      background-size: 10mm 10mm;
    }

    /* Fahrtrichtungs-Pfeile */
    .zeichenkasten-inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3mm;
      pointer-events: none;
      user-select: none;
    }

    .fahrt-label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .arrow-svg {
      opacity: 0.18;
    }

    /* ── FOOTER ─────────────────────────────────────── */
    .footer {
      border-top: 0.25mm solid #e2e8f0;
      padding: 2mm 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 7pt;
      color: #94a3b8;
      flex-shrink: 0;
    }

    @media print {
      html, body { width: 210mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER: nur LKW-ID + QR -->
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

  <!-- CONTENT -->
  <div class="content">

    <!-- Spedition -->
    <div>
      <div class="field-label">Spedition</div>
      <div class="field-value large ${!data.speditionName ? "empty" : ""}">
        ${data.speditionName ? escHtml(data.speditionName.toUpperCase()) : "Nicht zugewiesen"}
      </div>
    </div>

    <div class="divider"></div>

    <!-- Kennzeichen + Bezeichnung -->
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

    <div class="divider"></div>

    <!-- Relation GROSS + ETA GROSS -->
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

    <div class="divider"></div>

    <!-- Bemerkungen -->
    <div>
      <div class="field-label">Bemerkungen</div>
      <div class="bemerkungen-box">
        <div class="bemerkungen-text ${!data.bemerkungen ? "empty" : ""}">
          ${data.bemerkungen ? escHtml(data.bemerkungen) : "Keine Bemerkungen"}
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Anzahl Paletten: Label links, Schreibfeld rechts -->
    <div class="paletten-row">
      <div class="paletten-label-cell">
        <div class="paletten-label-text">Anzahl<br/>Paletten</div>
      </div>
      <div class="paletten-writein-cell">
        <div class="writein-line"></div>
        <div class="writein-line"></div>
      </div>
    </div>

    <!-- Zeichenkasten: Palettenstand aufzeichnen -->
    <div class="zeichenkasten">
      <div class="zeichenkasten-header">Palettenstand — Skizze (Draufsicht)</div>
      <div class="zeichenkasten-body">
        <div class="zeichenkasten-inner">
          <div class="fahrt-label">▲ Fahrtrichtung</div>
          <svg class="arrow-svg" width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="30" y1="55" x2="30" y2="5"  stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
            <polyline points="15,22 30,5 45,22" fill="none" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
            <line x1="5"  y1="30" x2="55" y2="30" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
            <polyline points="38,15 55,30 38,45" fill="none" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    </div>

  </div><!-- /content -->

  <!-- FOOTER -->
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

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Popup wurde blockiert. Bitte Popup-Blocker für diese Seite deaktivieren.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
