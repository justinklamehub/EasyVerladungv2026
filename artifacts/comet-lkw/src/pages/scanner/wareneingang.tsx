import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, Send, RotateCcw, CheckCircle2, AlertCircle, Loader2, PenTool } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const C = "#b4ff00";
const BG = "#f1f5f9";
const CARD = "#ffffff";
const BORDER = "#e2e8f0";

const S = {
  page: {
    minHeight: "100dvh",
    background: BG,
    color: "#0f172a",
    fontFamily: "system-ui,-apple-system,sans-serif",
    paddingBottom: 40,
  },
  header: {
    background: "#ffffff",
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
    color: "#475569",
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
    background: "#f8fafc",
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
    background: "#f8fafc",
    border: `1.5px solid ${BORDER}`,
    borderRadius: 7,
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  inputReadonly: {
    opacity: 0.6,
    cursor: "default",
  },
  sigBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: 6,
    border: `1.5px dashed ${BORDER}`,
    background: "#f8fafc",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    marginTop: 6,
  },
  sigBtnSigned: {
    borderColor: "#16a34a",
    color: "#16a34a",
    background: "rgba(22,163,74,0.06)",
  },
  submitBtn: {
    margin: "20px 12px 0",
    width: "calc(100% - 24px)",
    padding: "16px",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.08em",
    background: "#0f172a",
    color: "#ffffff",
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
  label, value, onChange, placeholder, type = "text", readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; type?: string; readOnly?: boolean;
}) {
  return (
    <div style={S.row}>
      <div style={S.label}>{label}</div>
      <input
        style={{ ...S.input, ...(readOnly ? S.inputReadonly : {}) }}
        type={type}
        value={value}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        placeholder={readOnly ? undefined : (placeholder ?? "")}
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

function SignaturePadModal({
  onConfirm, onCancel,
}: {
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? (e as TouchEvent).touches[0] : (e as MouseEvent);
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      lastPos.current = getPos(e, canvas);
      setIsEmpty(false);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current || !lastPos.current) return;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
    };
    const end = () => { drawing.current = false; lastPos.current = null; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, []);

  function clearPad() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(15,23,42,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#ffffff",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 16,
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 10, letterSpacing: "0.1em" }}>
          UNTERSCHRIFT ERFASSEN
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          style={{
            width: "100%",
            height: 180,
            border: `2px solid #cbd5e1`,
            borderRadius: 6,
            display: "block",
            touchAction: "none",
            cursor: "crosshair",
            background: "#f8fafc",
          }}
        />
        <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 6 }}>
          Hier unterschreiben
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={clearPad}
            style={{
              flex: 1, padding: "11px", borderRadius: 6,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <RotateCcw size={14} /> Löschen
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px", borderRadius: 6,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            Abbrechen
          </button>
          <button
            disabled={isEmpty}
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              onConfirm(canvas.toDataURL("image/png"));
            }}
            style={{
              flex: 2, padding: "11px", borderRadius: 6,
              border: "none",
              background: isEmpty ? "#e2e8f0" : "#0f172a",
              color: isEmpty ? "#94a3b8" : "#ffffff",
              cursor: isEmpty ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <CheckCircle2 size={14} /> Übernehmen
          </button>
        </div>
      </div>
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

  const [anlieferungsdatum, setAnlieferungsdatum] = useState(today);
  const [beauftrageSpedition, setBeauftrageSpedition] = useState(spedition);
  const [ausfuehrendeSpedition, setAusfuehrendeSpedition] = useState("");
  const [kfzKennzeichen, setKfzKennzeichen] = useState(kennzeichen);
  const [anzPaletten, setAnzPaletten] = useState("");
  const [defektePaletten, setDefektePaletten] = useState("");
  const [bemerkungen, setBemerkungen] = useState("");
  const [wareErhaltenDatum, setWareErhaltenDatum] = useState(today);
  const [unterschrift, setUnterschrift] = useState<string | null>(null);
  const [druckbuchstaben, setDruckbuchstaben] = useState("");
  const [showSigPad, setShowSigPad] = useState(false);

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
          lkwid: shipmentId,
          anlieferungsdatum,
          beauftrageSpedition,
          ausfuehrendeSpedition,
          kfzKennzeichen,
          anzPaletten,
          defektePaletten,
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
        <CheckCircle2 size={56} color="#16a34a" />
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", textAlign: "center" }}>
          Wareneingangsprotokoll gespeichert
        </div>
        <div style={{ fontSize: 14, color: "#475569", textAlign: "center" }}>
          Lfd. Nr. <strong style={{ color: "#0f172a" }}>{lfdNr}</strong>
          {shipmentId && <> · LKW-ID <strong style={{ color: "#0f172a" }}>{shipmentId}</strong></>}
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
      {showSigPad && (
        <SignaturePadModal
          onConfirm={(dataUrl) => { setUnterschrift(dataUrl); setShowSigPad(false); }}
          onCancel={() => setShowSigPad(false)}
        />
      )}

      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => setLocation("/scanner")}>
          <ChevronLeft size={15} /> Zurück
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Wareneingangsprotokoll</div>
          {(shipmentId || bezeichnung) && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {bezeichnung || `LKW-ID ${shipmentId}`}
            </div>
          )}
        </div>
      </div>

      {/* Kopfdaten */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Kopfdaten</div>
        <Field label="LKW-ID" value={shipmentId} readOnly />
        <Field label="Anlieferungsdatum" value={anlieferungsdatum} onChange={setAnlieferungsdatum} type="date" />
        <Field label="Beauftragte Spedition" value={beauftrageSpedition} onChange={setBeauftrageSpedition} />
        <Field label="Ausführende Spedition" value={ausfuehrendeSpedition} onChange={setAusfuehrendeSpedition} />
        <Field label="KFZ-Kennzeichen" value={kfzKennzeichen} onChange={setKfzKennzeichen} />
      </div>

      {/* Paletten */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Paletten</div>
        <TwoCol
          label1="Anz. Paletten" value1={anzPaletten} onChange1={setAnzPaletten}
          label2="Defekte Paletten" value2={defektePaletten} onChange2={setDefektePaletten}
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

      {/* Ware erhalten / Unterschrift */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Ware erhalten</div>
        <Field label="Datum" value={wareErhaltenDatum} onChange={setWareErhaltenDatum} type="date" />
        <div style={S.row}>
          <div style={S.label}>Unterschrift</div>
          <button
            style={{ ...S.sigBtn, ...(unterschrift ? S.sigBtnSigned : {}) }}
            onClick={() => setShowSigPad(true)}
          >
            {unterschrift ? (
              <><CheckCircle2 size={16} /> Unterschrift vorhanden (erneut erfassen)</>
            ) : (
              <><PenTool size={16} /> Unterschrift erfassen</>
            )}
          </button>
          {unterschrift && (
            <img
              src={unterschrift}
              alt="Unterschrift"
              style={{ marginTop: 8, width: "100%", height: 60, objectFit: "contain", borderRadius: 4, background: "#f8fafc", border: `1px solid ${BORDER}` }}
            />
          )}
        </div>
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
