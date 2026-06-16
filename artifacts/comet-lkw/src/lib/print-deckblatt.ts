import { format } from "date-fns";
import { de } from "date-fns/locale";

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
  palletBalance?: number | null;
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
    return etaTime ? `${d} ${etaTime} Uhr` : d;
  } catch {
    return etaDate;
  }
}

export function printDeckblatt(data: DeckblattData) {
  const now = new Date();
  const printTs = format(now, "dd.MM.yyyy HH:mm:ss", { locale: de });
  const lkwId = formatLkwId(data.shipmentId);
  const eta = formatEta(data.etaDate, data.etaTime);

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
      padding: 0;
    }

    /* ── HEADER ─────────────────────────────────────── */
    .header {
      background: #0f172a;
      color: #fff;
      padding: 18mm 14mm 12mm 14mm;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8mm;
    }

    .header-left {}

    .company-name {
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 2mm;
    }

    .doc-title {
      font-size: 22pt;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.01em;
      line-height: 1.1;
    }

    .doc-subtitle {
      font-size: 9pt;
      color: #64748b;
      margin-top: 1.5mm;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* ── LKW-ID BADGE ───────────────────────────────── */
    .lkw-id-badge {
      background: #c0392b;
      border-radius: 3mm;
      padding: 4mm 8mm;
      text-align: center;
      min-width: 44mm;
      flex-shrink: 0;
    }

    .lkw-id-label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #fca5a5;
      margin-bottom: 1.5mm;
    }

    .lkw-id-value {
      font-size: 20pt;
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
      padding: 2.5mm 14mm;
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
      padding: 10mm 14mm 8mm 14mm;
      display: flex;
      flex-direction: column;
      gap: 7mm;
    }

    /* ── FIELD ──────────────────────────────────────── */
    .field-label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 1.5mm;
    }

    .field-value {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.25;
      word-break: break-word;
    }

    .field-value.large {
      font-size: 18pt;
    }

    .field-value.empty {
      color: #cbd5e1;
      font-weight: 400;
      font-style: italic;
    }

    /* ── GRID ROWS ──────────────────────────────────── */
    .row {
      display: flex;
      gap: 6mm;
    }

    .col { flex: 1; }
    .col-2 { flex: 2; }
    .col-auto { flex: none; min-width: 28mm; }

    /* ── DIVIDER ────────────────────────────────────── */
    .divider {
      height: 0.3mm;
      background: #e2e8f0;
      margin: 0;
    }

    /* ── PALLET BOX ─────────────────────────────────── */
    .pallet-box {
      border: 0.5mm solid #0f172a;
      border-radius: 2mm;
      padding: 6mm 8mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6mm;
    }

    .pallet-label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #475569;
    }

    .pallet-number {
      font-size: 40pt;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .pallet-unit {
      font-size: 11pt;
      color: #64748b;
      font-weight: 600;
      margin-left: 2mm;
    }

    /* ── BEMERKUNGEN ────────────────────────────────── */
    .bemerkungen-box {
      background: #f8fafc;
      border: 0.3mm solid #e2e8f0;
      border-radius: 2mm;
      padding: 5mm 6mm;
      min-height: 22mm;
    }

    .bemerkungen-text {
      font-size: 11pt;
      color: #1e293b;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* ── FOOTER ─────────────────────────────────────── */
    .footer {
      border-top: 0.3mm solid #e2e8f0;
      padding: 5mm 14mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
    }

    .footer-left {
      display: flex;
      align-items: center;
      gap: 2mm;
    }

    .footer-star { color: #c0392b; font-size: 9pt; }

    @media print {
      html, body { width: 210mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="company-name">COMET Feuerwerk GmbH</div>
      <div class="doc-title">Verladungs&shy;deckblatt</div>
      <div class="doc-subtitle">${data.bezeichnung ? escHtml(data.bezeichnung) : "&nbsp;"}</div>
    </div>
    <div class="lkw-id-badge">
      <div class="lkw-id-label">LKW-ID</div>
      <div class="lkw-id-value">${escHtml(lkwId)}</div>
    </div>
  </div>

  <!-- STATUS BANNER -->
  <div class="status-banner">
    <div class="status-dot ${statusDotClass(data.status)}"></div>
    <span>Status: ${escHtml(data.status || "—")}</span>
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
        <div class="field-value ${!data.relation ? "empty" : ""}">
          ${data.relation ? escHtml(data.relation) : "—"}
        </div>
      </div>
      <div class="col">
        <div class="field-label">Voraussichtl. Ankunft</div>
        <div class="field-value ${!data.etaDate ? "empty" : ""}">
          ${escHtml(eta)}
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Paletten -->
    <div>
      <div class="field-label">Anzahl Paletten</div>
      <div class="pallet-box">
        <div class="pallet-label">Netto-Paletten<br>dieser Verladung</div>
        <div>
          <span class="pallet-number">${data.palletBalance != null ? data.palletBalance : "—"}</span>
          ${data.palletBalance != null ? '<span class="pallet-unit">Pal.</span>' : ""}
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

  </div><!-- /content -->

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-left">
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
