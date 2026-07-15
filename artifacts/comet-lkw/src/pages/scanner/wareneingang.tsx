import { useState, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, Send, RotateCcw, CheckCircle2, AlertCircle, Loader2, PenTool, X } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const C = "#b4ff00";
const BG = "#0d1b2a";
const CARD = "#111d2e";
const BORDER = "#1e3a5f";

const S = {
  page: {
    minHeight: "100dvh",
    background: BG,
    color: "#e2e8f0",
    fontFamily: "system-ui,-apple-system,sans-serif",
    paddingBottom: 40,
  },
  header: {
    background: "#0a1628",
    borderBottom: `1px solid ${BORDER}`,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: "#94a3b8",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    padding: "6px 10px",
  },
  section: {
    margin: "12px 12px 0",
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    overflow: "hidden",
  },
  sectionTitle: {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#64748b",
    borderBottom: `1px solid ${BORDER}`,
    background: "#0a1628",
  },
  row: {
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
  },
  label: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 4,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    background: "#0d1b2a",
    border: `1.5px solid ${BORDER}`,
    borderRadius: 7,
    color: "#e2e8f0",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    borderBottom: `1px solid ${BORDER}`,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    border: `2px solid ${BORDER}`,
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  submitBtn: {
    margin: "20px 12px 0",
    width: "calc(100% - 24px)",
    padding: "16px",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    background: C,
    color: "#0d1b2a",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
};

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div style={S.row}>
      <div style={S.label}>{label}</div>
      <input
        style={S.input}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? ""}
      />
    </div>
  );
}

function TwoCol({
  label1, value1, onChange1, label2, value2, onChange2,
}: {
  label1: string; value1: string; onChange1: (v: string) => void;
  label2: string; value2: string; onChange2: (v: string) => void;
}) {
  return (
    <div style={{ ...S.row, display: "flex", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={S.label}>{label1}</div>
        <input style={{ ...S.input, fontSize: 14 }} value={value1} onChange={(e) => onChange1(e.target.value)} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={S.label}>{label2}</div>
        <input style={{ ...S.input, fontSize: 14 }} value={value2} onChange={(e) => onChange2(e.target.value)} />
      </div>
    </div>
  );
}

function CheckItem({
  label, checked, onToggle, lagerplatz, onLagerplatz,
}: {
  label: string; checked: boolean; onToggle: () => void;
  lagerplatz: string; onLagerplatz: (v: string) => void;
}) {
  return (
    <div style={{ ...S.row, display: "grid", gridTemplateColumns: "auto 1fr auto 1fr", alignItems: "center", gap: 8 }}>
      <button
        style={{
          ...S.checkbox,
          background: checked ? C : "transparent",
          borderColor: checked ? C : BORDER,
        }}
        onClick={onToggle}
      >
        {checked && <span style={{ fontSize: 14, color: BG, fontWeight: 700 }}>✓</span>}
      </button>
      <span style={{ fontSize: 14, color: checked ? "#e2e8f0" : "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Lagerplatz:</span>
      <input
        style={{ ...S.input, fontSize: 13, padding: "6px 10px" }}
        value={lagerplatz}
        onChange={(e) => onLagerplatz(e.target.value)}
        placeholder="—"
      />
    </div>
  );
}

function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = C;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, []);

  const endDraw = useCallback(() => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL());
  }, [onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }, [onChange]);

  return (
    <div style={S.row}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={S.label}>{label}</div>
        <button
          onClick={clear}
          style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 5, color: "#64748b", cursor: "pointer", fontSize: 11, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}
        >
          <RotateCcw size={10} /> Löschen
        </button>
      </div>
      <div style={{ border: `1.5px solid ${value ? C : BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          style={{ display: "block", width: "100%", height: 120, touchAction: "none", background: "#0a1628" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      {!value && (
        <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 4 }}>
          <PenTool size={11} style={{ display: "inline", marginRight: 4 }} />
          Bitte unterschreiben
        </div>
      )}
    </div>
  );
}

export default function ScannerWareneingangPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const shipmentId = params.get("shipmentId") || "";
  const kennzeichen = params.get("kennzeichen") || "";
  const bezeichnung = params.get("bezeichnung") || "";
  const spedition = params.get("spedition") || "";

  const today = new Date().toISOString().slice(0, 10);

  const [lkwid, setLkwid] = useState(shipmentId);
  const [palettenscheinNr, setPalettenscheinNr] = useState("");
  const [anlieferungsdatum, setAnlieferungsdatum] = useState(today);
  const [beauftrageSpedition, setBeauftrageSpedition] = useState(spedition);
  const [ausfuehrendeSpedition, setAusfuehrendeSpedition] = useState("");
  const [kfzKennzeichen, setKfzKennzeichen] = useState(kennzeichen);
  const [anzPaletten, setAnzPaletten] = useState("");
  const [defektePaletten, setDefektePaletten] = useState("");
  const [anzKartonsSoll, setAnzKartonsSoll] = useState("");
  const [anzKartonsIst, setAnzKartonsIst] = useState("");
  const [artRetoure, setArtRetoure] = useState(false);
  const [artServiceware, setArtServiceware] = useState(false);
  const [artSonstiges, setArtSonstiges] = useState(false);
  const [lagerplatzRetoure, setLagerplatzRetoure] = useState("");
  const [lagerplatzServiceware, setLagerplatzServiceware] = useState("");
  const [lagerplatzSonstiges, setLagerplatzSonstiges] = useState("");
  const [bemerkungen, setBemerkungen] = useState("");
  const [wareErhaltenDatum, setWareErhaltenDatum] = useState(today);
  const [unterschrift, setUnterschrift] = useState("");
  const [druckbuchstaben, setDruckbuchstaben] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lfdNr, setLfdNr] = useState<number | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`${API}/scanner/wareneingang`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: shipmentId ? Number(shipmentId) : null,
          lkwid,
          palettenscheinNr,
          anlieferungsdatum,
          beauftrageSpedition,
          ausfuehrendeSpedition,
          kfzKennzeichen,
          anzPaletten,
          defektePaletten,
          anzKartonsSoll,
          anzKartonsIst,
          artRetoure,
          artServiceware,
          artSonstiges,
          lagerplatzRetoure,
          lagerplatzServiceware,
          lagerplatzSonstiges,
          bemerkungen,
          wareErhaltenDatum,
          unterschrift,
          druckbuchstaben,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Fehler ${res.status}`);
      }
      const data = await res.json();
      setLfdNr(data.lfdNr);
      setSubmitOk(true);
    } catch (e: any) {
      setSubmitError(e.message ?? "Unbekannter Fehler");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitOk) {
    return (
      <div style={{ ...S.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <CheckCircle2 size={56} color={C} />
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc", textAlign: "center" }}>
          Wareneingangsprotokoll gespeichert
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
          Lfd. Nr. <strong style={{ color: C }}>{lfdNr}</strong>
          {shipmentId && <> · LKW-ID <strong style={{ color: C }}>{shipmentId}</strong></>}
        </div>
        <button
          style={{ ...S.submitBtn, marginTop: 16, width: "auto", padding: "12px 28px" }}
          onClick={() => setLocation("/scanner")}
        >
          Zurück zum Scanner
        </button>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => setLocation("/scanner")}>
          <ChevronLeft size={15} /> Zurück
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>Wareneingangsprotokoll</div>
          {(shipmentId || bezeichnung) && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {bezeichnung || `LKW-ID ${shipmentId}`}
            </div>
          )}
        </div>
      </div>

      {/* LKW-ID + Palettenschein header row */}
      <div style={{ ...S.section }}>
        <div style={S.sectionTitle}>Kopfdaten</div>
        <TwoCol
          label1="LKWID" value1={lkwid} onChange1={setLkwid}
          label2="Palettenschein-Nr." value2={palettenscheinNr} onChange2={setPalettenscheinNr}
        />
        <Field label="Anlieferungsdatum" value={anlieferungsdatum} onChange={setAnlieferungsdatum} type="date" />
        <Field label="Beauftragte Spedition" value={beauftrageSpedition} onChange={setBeauftrageSpedition} />
        <Field label="Ausführende Spedition" value={ausfuehrendeSpedition} onChange={setAusfuehrendeSpedition} />
        <Field label="KFZ-Kennzeichen" value={kfzKennzeichen} onChange={setKfzKennzeichen} />
      </div>

      {/* Paletten */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Paletten & Kartons</div>
        <TwoCol
          label1="Anz. Paletten" value1={anzPaletten} onChange1={setAnzPaletten}
          label2="Defekte Paletten" value2={defektePaletten} onChange2={setDefektePaletten}
        />
        <TwoCol
          label1="Anz. Kartons SOLL" value1={anzKartonsSoll} onChange1={setAnzKartonsSoll}
          label2="Anz. Kartons IST" value2={anzKartonsIst} onChange2={setAnzKartonsIst}
        />
      </div>

      {/* Art der Anlieferung */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Art der Anlieferung</div>
        <CheckItem
          label="Retoure"
          checked={artRetoure}
          onToggle={() => setArtRetoure((v) => !v)}
          lagerplatz={lagerplatzRetoure}
          onLagerplatz={setLagerplatzRetoure}
        />
        <CheckItem
          label="Serviceware"
          checked={artServiceware}
          onToggle={() => setArtServiceware((v) => !v)}
          lagerplatz={lagerplatzServiceware}
          onLagerplatz={setLagerplatzServiceware}
        />
        <CheckItem
          label="Sonstiges"
          checked={artSonstiges}
          onToggle={() => setArtSonstiges((v) => !v)}
          lagerplatz={lagerplatzSonstiges}
          onLagerplatz={setLagerplatzSonstiges}
        />
      </div>

      {/* Bemerkungen */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Bemerkungen</div>
        <div style={S.row}>
          <textarea
            style={{ ...S.input, minHeight: 80, resize: "vertical", verticalAlign: "top" }}
            value={bemerkungen}
            onChange={(e) => setBemerkungen(e.target.value)}
            placeholder="Freitext…"
          />
        </div>
      </div>

      {/* Ware erhalten */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Ware erhalten</div>
        <Field label="Datum" value={wareErhaltenDatum} onChange={setWareErhaltenDatum} type="date" />
        <SignaturePad label="Unterschrift" value={unterschrift} onChange={setUnterschrift} />
        <Field label="Druckbuchstaben (Name)" value={druckbuchstaben} onChange={setDruckbuchstaben} placeholder="Vor- und Nachname" />
      </div>

      {submitError && (
        <div style={{ margin: "12px 12px 0", padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={15} /> {submitError}
        </div>
      )}

      <button
        style={{ ...S.submitBtn, opacity: isSubmitting ? 0.7 : 1, cursor: isSubmitting ? "not-allowed" : "pointer" }}
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        WARENEINGANGSPROTOKOLL EINREICHEN
      </button>
    </div>
  );
}
