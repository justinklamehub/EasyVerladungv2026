import { format } from "date-fns";
import { de } from "date-fns/locale";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

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

function statusDotClass(status?: string | null): string {
  switch (status) {
    case "Angekommen":
    case "Verladen":
      return "blue";
    case "Abgefertigt":
      return "";
    case "Storniert":
      return "red";
    case "Erwartet":
      return "orange";
    default:
      return "gray";
  }
}

function generateBarcodeDataUrl(value: string): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2.5,
    height: 70,
    displayValue: false,
    margin: 6,
    background: "#ffffff",
    lineColor: "#0f172a",
  });
  return canvas.toDataURL("image/png");
}

export async function printDeckblatt(data: DeckblattData) {
  const now = new Date();
  const printTs = format(now, "dd.MM.yyyy HH:mm:ss", { locale: de });
  const lkwId = formatLkwId(data.shipmentId);
  const eta = formatEta(data.etaDate, data.etaTime);

  const [qrDataUrl, barcodeDataUrl] = await Promise.all([
    QRCode.toDataURL(lkwId, {
      width: 200,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }),
    Promise.resolve(generateBarcodeDataUrl(lkwId)),
  ]);

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
      min-height: 297mm;
      background: #fff;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      display: flex;
      flex-direction: column;
    }

    /* ── HEADER ─────────────────────────────────────── */
    .header {
      background: #0f172a;
      color: #fff;
      padding: 14mm 14mm 10mm 14mm;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6mm;
    }

    .company-name {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2mm;
    }

    .doc-title {
      font-size: 24pt;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.01em;
      line-height: 1.1;
    }

    .doc-subtitle {
      font-size: 9pt;
      color: #94a3b8;
      margin-top: 1.5mm;
      letter-spacing: 0.02em;
    }

    /* ── LKW-ID BADGE ───────────────────────────────── */
    .lkw-id-badge {
      background: #c0392b;
      border-radius: 3mm;
      padding: 3.5mm 7mm;
      text-align: center;
      min-width: 42mm;
      flex-shrink: 0;
    }

    .lkw-id-label {
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #fca5a5;
      margin-bottom: 1.5mm;
    }

    .lkw-id-value {
      font-size: 19pt;
      font-weight: 900;
      color: #fff;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }

    /* ── STATUS BANNER ──────────────────────────────── */
    .status-banner {
      background: #1e293b;
      color: #94a3b8;
      font-size: 8pt;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 2mm 14mm;
      display: flex;
      align-items: center;
      gap: 4mm;
    }

    .status-dot {
      width: 2.5mm;
      height: 2.5mm;
      border-radius: 50%;
      background: #22c55e;
      flex-shrink: 0;
    }
    .status-dot.orange { background: #f59e0b; }
    .status-dot.blue   { background: #3b82f6; }
    .status-dot.red    { background: #ef4444; }
    .status-dot.gray   { background: #6b7280; }

    /* ── CONTENT ────────────────────────────────────── */
    .content {
      flex: 1;
      padding: 8mm 14mm 6mm 14mm;
      display: flex;
      flex-direction: column;
      gap: 5.5mm;
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

    .field-value.large { font-size: 17pt; }
    .field-value.medium { font-size: 12pt; }

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
      padding: 4mm 5mm;
      min-height: 16mm;
    }

    .bemerkungen-text {
      font-size: 10.5pt;
      color: #1e293b;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* ── PALETTEN WRITE-IN ──────────────────────────── */
    .paletten-writein {
      border: 0.6mm solid #0f172a;
      border-radius: 2mm;
      padding: 5mm 6mm 4mm 6mm;
    }

    .paletten-writein .field-label {
      font-size: 7pt;
      margin-bottom: 3mm;
    }

    .writein-lines {
      display: flex;
      flex-direction: column;
      gap: 6mm;
    }

    .writein-line {
      height: 0.3mm;
      background: #334155;
      opacity: 0.3;
    }

    /* ── CODES SECTION ──────────────────────────────── */
    .codes-section {
      border-top: 0.8mm solid #0f172a;
      padding-top: 5mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8mm;
    }

    .barcode-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1.5mm;
    }

    .barcode-label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }

    .barcode-img {
      max-width: 100%;
      height: 18mm;
      display: block;
    }

    .barcode-id {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
    }

    .qr-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5mm;
      flex-shrink: 0;
    }

    .qr-label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }

    .qr-img {
      width: 28mm;
      height: 28mm;
      display: block;
    }

    /* ── FOOTER ─────────────────────────────────────── */
    .footer {
      border-top: 0.25mm solid #e2e8f0;
      padding: 3.5mm 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 7pt;
      color: #94a3b8;
    }

    .footer-star { color: #c0392b; font-size: 9pt; margin-right: 1.5mm; }

    @media print {
      html, body { width: 210mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="company-name">COMET Feuerwerk GmbH</div>
      <div class="doc-title">Verladungs&shy;deckblatt</div>
      <div class="doc-subtitle">${data.bezeichnung ? escHtml(data.bezeichnung) : "&nbsp;"}</div>
    </div>
  </div>

  <!-- STATUS BANNER -->
  <div class="status-banner">
    <div class="status-dot ${statusDotClass(data.status)}"></div>
    <span>Status:&nbsp;${escHtml(data.status || "—")}</span>
    ${data.lkwArt ? `<span style="margin-left:auto;color:#475569;">${escHtml(data.lkwArt)}</span>` : ""}
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

    <!-- Kennzeichen + Tor -->
    <div class="row">
      <div class="col">
        <div class="field-label">Kennzeichen</div>
        <div class="field-value large ${!data.kennzeichen ? "empty" : ""}">
          ${data.kennzeichen ? escHtml(data.kennzeichen) : "—"}
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

    <!-- Relation + ETA -->
    <div class="row">
      <div class="col-2">
        <div class="field-label">Relation / Leitgebiet</div>
        <div class="field-value medium ${!data.relation ? "empty" : ""}">
          ${data.relation ? escHtml(data.relation) : "—"}
        </div>
      </div>
      <div class="col">
        <div class="field-label">Voraussichtl. Ankunft</div>
        <div class="field-value medium ${!data.etaDate ? "empty" : ""}">
          ${escHtml(eta)}
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Bemerkungen -->
    <div>
      <div class="field-label">Bemerkungen Lager / Spedition</div>
      <div class="bemerkungen-box">
        <div class="bemerkungen-text ${!data.bemerkungen ? "empty" : ""}">
          ${data.bemerkungen ? escHtml(data.bemerkungen) : "Keine Bemerkungen"}
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Paletten Write-In -->
    <div class="paletten-writein">
      <div class="field-label">Anzahl Paletten &nbsp;(handschriftlich)</div>
      <div class="writein-lines">
        <div class="writein-line"></div>
        <div class="writein-line"></div>
      </div>
    </div>

    <!-- Codes: Barcode + QR -->
    <div class="codes-section">
      <div class="barcode-wrap">
        <div class="barcode-label">Barcode</div>
        <img class="barcode-img" src="${barcodeDataUrl}" alt="Barcode ${lkwId}" />
        <div class="barcode-id">${escHtml(lkwId)}</div>
      </div>
      <div class="qr-wrap">
        <div class="qr-label">QR-Code</div>
        <img class="qr-img" src="${qrDataUrl}" alt="QR ${lkwId}" />
      </div>
    </div>

  </div><!-- /content -->

  <!-- FOOTER -->
  <div class="footer">
    <div style="display:flex;align-items:center;">
      <span class="footer-star">★</span>
      <span>Ausdruck vom ${escHtml(printTs)} Uhr</span>
    </div>
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
