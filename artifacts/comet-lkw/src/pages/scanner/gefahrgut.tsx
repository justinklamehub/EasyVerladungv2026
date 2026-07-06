import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import {
  CheckSquare, Square, ChevronLeft, Send, RotateCcw,
  PenTool, CheckCircle2, AlertCircle, Loader2, Camera, X, ImagePlus,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type Col = "b" | "v";

const ITEMS: { id: number; text: string; specialInput?: string; cols: Col[] }[] = [
  { id: 1,  text: "zwei plombierte Feuerlöscher (min. 6 kg) mit Prüfdatum", cols: ["b"] },
  { id: 2,  text: "mind. zwei Unterlegkeile", cols: ["b"] },
  { id: 3,  text: "Fahrzeugkennzeichnung (Warntafel und Gefahrzettel)", cols: ["b", "v"] },
  { id: 4,  text: "zwei selbststehende Warnzeichen (z.B. Warndreieck + Warnblinkleuchte)", cols: ["b"] },
  { id: 5,  text: "eine geeignete Warnweste oder Warnkleidung (nach Norm EN 471)", cols: ["b"] },
  { id: 6,  text: "keine sichtbaren Mängel am Fahrzeug (Reifen, Beleuchtung)", cols: ["b"] },
  { id: 7,  text: "gültige Fahrerlaubnis (Fahrer + ggf. Beifahrer)", cols: ["b", "v"] },
  { id: 8,  text: "Lichtbildausweis (Fahrer + ggf. Beifahrer)", cols: ["b", "v"] },
  { id: 9,  text: "ADR–Schein mit Eintrag der Klasse 1 – gültig bis:", specialInput: "adr", cols: ["b", "v"] },
  { id: 10, text: "Zusammenladungsverbot beachtet", cols: ["b", "v"] },
  { id: 11, text: "Ladungssicherung mit geeigneten Mitteln durchgeführt", cols: ["b", "v"] },
  { id: 12, text: "Beförderungspapier", cols: ["v"] },
  { id: 13, text: "neue schriftliche Weisung gem. ADR 2023 an Bord?", cols: ["b"] },
  { id: 14, text: "Fahrzeug verschlussfähig", cols: ["b"] },
  { id: 15, text: "auf Rauchverbot im Fahrerhaus hingewiesen (auch E-Zigaretten)", cols: ["v"] },
  { id: 16, text: "Plombe(n) übergeben mit der/den Nr.:", specialInput: "plomben", cols: ["v"] },
  { id: 17, text: '"Ladung auf LKW" mit Foto dokumentiert', cols: ["v"] },
];

type SigTarget = "fahrer" | "verlader" | null;
type Checks = Record<string, boolean>;

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
  headerTitle: {
    flex: 1,
    textAlign: "center" as const,
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
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  markAllRow: {
    display: "flex",
    gap: 8,
  },
  markBtn: (col: "B" | "V") => ({
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    background: col === "B" ? "rgba(59,130,246,0.2)" : "rgba(180,255,0,0.15)",
    color: col === "B" ? "#93c5fd" : C,
    letterSpacing: "0.05em",
  }),
  checkRow: {
    display: "flex",
    alignItems: "flex-start",
    padding: "10px 14px",
    borderBottom: `1px solid ${BORDER}`,
    gap: 10,
    minHeight: 52,
  },
  checkboxes: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
  },
  checkBox: (checked: boolean) => ({
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    border: `2px solid ${checked ? "#facc15" : "#2d4a6b"}`,
    background: checked ? "rgba(250,204,21,0.15)" : "transparent",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
  }),
  checkLabel: {
    fontSize: 14,
    lineHeight: 1.4,
    flex: 1,
    paddingTop: 4,
    color: "#cbd5e1",
  },
  colHeader: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
    padding: "6px 14px 0",
  },
  colLabel: {
    width: 30,
    textAlign: "center" as const,
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.08em",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    background: "#0d1b2a",
    border: `1.5px solid ${BORDER}`,
    borderRadius: 6,
    color: "#f1f5f9",
    outline: "none",
    marginTop: 6,
    boxSizing: "border-box" as const,
  },
  inputFocus: {
    border: `1.5px solid ${C}`,
  },
  fieldRow: {
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    marginBottom: 4,
    display: "block",
  },
  sigBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: 6,
    border: `1.5px dashed ${BORDER}`,
    background: "#0a1628",
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
    borderColor: C,
    color: C,
    background: "rgba(180,255,0,0.06)",
  },
  numInput: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 18,
    fontWeight: 700,
    background: "#0d1b2a",
    border: `1.5px solid ${BORDER}`,
    borderRadius: 6,
    color: "#f1f5f9",
    outline: "none",
    textAlign: "center" as const,
    boxSizing: "border-box" as const,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: "12px 14px",
    borderBottom: `1px solid ${BORDER}`,
  },
  numLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    marginBottom: 4,
    display: "block",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    background: "#0d1b2a",
    border: `1.5px solid ${BORDER}`,
    borderRadius: 6,
    color: "#f1f5f9",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 72,
    boxSizing: "border-box" as const,
    fontFamily: "inherit",
  },
  submitBtn: {
    width: "100%",
    padding: "18px",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.12em",
    background: C,
    color: BG,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
  },
  resetBtn: {
    width: "100%",
    padding: "14px",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.08em",
    background: "transparent",
    color: "#94a3b8",
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
};

function SignaturePad({
  onConfirm,
  onCancel,
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
    ctx.fillStyle = "#0d1b2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = C;
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
    ctx.fillStyle = "#0d1b2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#111d2e",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 16,
        width: "100%",
        maxWidth: 480,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.1em" }}>
          UNTERSCHRIFT ERFASSEN
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          style={{
            width: "100%",
            height: 180,
            border: `2px solid ${C}`,
            borderRadius: 6,
            display: "block",
            touchAction: "none",
            cursor: "crosshair",
          }}
        />
        <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 6 }}>
          Hier unterschreiben
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={clearPad}
            style={{
              flex: 1, padding: "11px", borderRadius: 6,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <RotateCcw size={14} /> Löschen
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px", borderRadius: 6,
              border: `1px solid #374151`, background: "transparent",
              color: "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600,
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
              background: isEmpty ? "#1e3a5f" : C,
              color: isEmpty ? "#475569" : BG,
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

function LiveCamera({
  onCapture,
  onCancel,
  onError,
  onLog,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  onLog: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onLog("getUserMedia() wird aufgerufen...");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        onLog(`getUserMedia() erfolgreich, Tracks: ${stream.getTracks().length}`);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((e) => onLog(`video.play() Fehler: ${e?.name} - ${e?.message}`));
        }
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        onLog(`getUserMedia() FEHLER: ${err?.name ?? "?"} - ${err?.message ?? String(err)}`);
        onError(err?.name === "NotAllowedError"
          ? "Kamerazugriff wurde verweigert."
          : "Kamera konnte nicht gestartet werden.");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      onLog("Aufnahme abgebrochen: kein Videoframe verfügbar (videoWidth=0)");
      return;
    }
    onLog(`Aufnahme wird erstellt (${video.videoWidth}x${video.videoHeight})...`);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onLog("Fehler: Canvas 2D-Kontext nicht verfügbar");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onLog("Fehler: canvas.toBlob() lieferte kein Ergebnis");
          return;
        }
        onLog(`Foto aufgenommen, Größe: ${(blob.size / 1024).toFixed(0)} KB`);
        const file = new File([blob], `ladung-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#111d2e",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 16,
        width: "100%",
        maxWidth: 480,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.1em" }}>
          FOTO DER LADUNG
        </div>
        <div style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          background: "#000",
          borderRadius: 6,
          overflow: "hidden",
          border: `2px solid ${C}`,
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {!ready && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 13,
            }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
              Kamera wird gestartet...
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px", borderRadius: 6,
              border: `1px solid #374151`, background: "transparent",
              color: "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            Abbrechen
          </button>
          <button
            disabled={!ready}
            onClick={capture}
            style={{
              flex: 2, padding: "11px", borderRadius: 6,
              border: "none",
              background: ready ? C : "#1e3a5f",
              color: ready ? BG : "#475569",
              cursor: ready ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <Camera size={14} /> Foto aufnehmen
          </button>
        </div>
      </div>
    </div>
  );
}

function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...S.input, ...(focused ? S.inputFocus : {}), ...(props.style ?? {}) }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

export default function ScannerGefahrgutPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const kennzeichen = params.get("kennzeichen") ?? "";
  const shipmentIdStr = params.get("shipmentId");
  const shipmentId = shipmentIdStr ? Number(shipmentIdStr) : null;
  const speditionPrefill = params.get("spedition") ?? "";

  const [, setLocation] = useLocation();

  const todayStr = new Date().toISOString().slice(0, 10);

  const [checks, setChecks] = useState<Checks>({});
  const [adrGueltigBis, setAdrGueltigBis] = useState("");
  const [plombenNr, setPlombenNr] = useState("");

  const [anhaenger, setAnhaenger] = useState("");
  const [spedition, setSpedition] = useState(speditionPrefill);
  const [nameFahrer, setNameFahrer] = useState("");
  const [unterschriftFahrer, setUnterschriftFahrer] = useState<string | null>(null);
  const [nameVerlader, setNameVerlader] = useState("");
  const [datum, setDatum] = useState(todayStr);
  const [unterschriftVerlader, setUnterschriftVerlader] = useState<string | null>(null);

  const [vonCometEuro, setVonCometEuro] = useState("");
  const [vonCometLasich, setVonCometLasich] = useState("");
  const [vonDefekte, setVonDefekte] = useState("");
  const [vonDuesseldorfer, setVonDuesseldorfer] = useState("");
  const [anCometEuro, setAnCometEuro] = useState("");
  const [anCometLasich, setAnCometLasich] = useState("");
  const [anDefekte, setAnDefekte] = useState("");
  const [anDuesseldorfer, setAnDuesseldorfer] = useState("");
  const [bemerkungen, setBemerkungen] = useState("");
  const [localKennzeichen, setLocalKennzeichen] = useState(kennzeichen);

  const [sigTarget, setSigTarget] = useState<SigTarget>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  type PendingPhoto = { previewUrl: string; objectPath: string; fileName: string; contentType: string };
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const { uploadFile, isUploading: isUploadingPhoto } = useUpload({ basePath: `${API}/storage` });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [liveCameraOpen, setLiveCameraOpen] = useState(false);
  const cameraSupportedRef = useRef<boolean | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString("de-DE", { hour12: false });
    setDebugLog((prev) => [...prev.slice(-49), `${time}  ${message}`]);
  }, []);

  useEffect(() => {
    addLog(`Seite geladen. URL-Protokoll: ${window.location.protocol}`);
    addLog(`Sicherer Kontext (window.isSecureContext): ${window.isSecureContext}`);
    addLog(`navigator.mediaDevices vorhanden: ${!!navigator.mediaDevices}`);
    addLog(`User-Agent: ${navigator.userAgent}`);
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      addLog("WARNUNG: Seite läuft NICHT über HTTPS -> Kamera-API wird vom Browser blockiert!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotoFile = useCallback(
    async (file: File) => {
      setPhotoUploadError("");
      addLog(`Upload gestartet: ${file.name} (${(file.size / 1024).toFixed(0)} KB, ${file.type})`);
      const result = await uploadFile(file);
      if (!result) {
        addLog("Upload FEHLGESCHLAGEN");
        setPhotoUploadError("Foto-Upload fehlgeschlagen. Bitte erneut versuchen.");
        return;
      }
      addLog(`Upload erfolgreich: ${result.objectPath}`);
      setPhotos((prev) => [
        ...prev,
        {
          previewUrl: URL.createObjectURL(file),
          objectPath: result.objectPath,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        },
      ]);
    },
    [uploadFile, addLog]
  );

  const handlePhotoSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        addLog("Datei-Dialog geschlossen ohne Auswahl");
        return;
      }
      addLog(`Datei ausgewählt: ${file.name}`);
      await addPhotoFile(file);
    },
    [addPhotoFile, addLog]
  );

  const openPhotoCapture = useCallback(() => {
    addLog("Button 'Foto aufnehmen' geklickt");
    if (!navigator.mediaDevices?.getUserMedia) {
      addLog("navigator.mediaDevices.getUserMedia ist nicht verfügbar -> nutze Datei-Dialog");
      cameraSupportedRef.current = false;
    }
    if (cameraSupportedRef.current === false) {
      addLog("Öffne nativen Datei-/Kamera-Dialog...");
      photoInputRef.current?.click();
      return;
    }
    addLog("Öffne Live-Kamera-Vorschau...");
    setLiveCameraOpen(true);
  }, [addLog]);

  const openGalleryPicker = useCallback(() => {
    addLog("Button 'Foto auswählen (Galerie/Datei)' geklickt");
    galleryInputRef.current?.click();
  }, [addLog]);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggle = useCallback((key: string) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const markAll = useCallback((col: "b" | "v") => {
    setChecks((prev) => {
      const relevant = ITEMS.filter((it) => it.cols.includes(col));
      const allChecked = relevant.every((it) => !!prev[`${it.id}_${col}`]);
      const next = { ...prev };
      relevant.forEach((it) => { next[`${it.id}_${col}`] = !allChecked; });
      return next;
    });
  }, []);

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const itemsPayload: Record<string, unknown> = {};
      ITEMS.forEach((it) => {
        itemsPayload[`${it.id}_b`] = !!checks[`${it.id}_b`];
        itemsPayload[`${it.id}_v`] = !!checks[`${it.id}_v`];
      });
      if (adrGueltigBis) itemsPayload["9_adr"] = adrGueltigBis;
      if (plombenNr) itemsPayload["16_plomben"] = plombenNr;

      const body = {
        shipmentId,
        kennzeichen: localKennzeichen || null,
        items: itemsPayload,
        anhaenger: anhaenger || null,
        spedition: spedition || null,
        nameFahrer: nameFahrer || null,
        unterschriftFahrer: unterschriftFahrer || null,
        nameVerlader: nameVerlader || null,
        datum,
        unterschriftVerlader: unterschriftVerlader || null,
        vonCometEuropaletten: vonCometEuro !== "" ? Number(vonCometEuro) : null,
        vonCometLadungssicherung: vonCometLasich !== "" ? Number(vonCometLasich) : null,
        vonDefektePaletten: vonDefekte !== "" ? Number(vonDefekte) : null,
        anCometEuropaletten: anCometEuro !== "" ? Number(anCometEuro) : null,
        anCometLadungssicherung: anCometLasich !== "" ? Number(anCometLasich) : null,
        anDefektePaletten: anDefekte !== "" ? Number(anDefekte) : null,
        bemerkungen: bemerkungen || null,
      };

      const res = await fetch(`${API}/scanner/gefahrgut`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Fehler");
      const { id: gefahrgutChecklisteId } = await res.json();

      let failedPhotoCount = 0;
      if (photos.length > 0) {
        const results = await Promise.all(
          photos.map((photo) =>
            fetch(`${API}/scanner/fotos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                shipmentId,
                kennzeichen: localKennzeichen || null,
                gefahrgutChecklisteId: gefahrgutChecklisteId ?? null,
                objectPath: photo.objectPath,
                fileName: photo.fileName,
                contentType: photo.contentType,
              }),
            })
              .then((r) => r.ok)
              .catch(() => false)
          )
        );
        failedPhotoCount = results.filter((ok) => !ok).length;
      }

      if (failedPhotoCount > 0) {
        setSubmitError(
          `Checkliste wurde übermittelt, aber ${failedPhotoCount} von ${photos.length} Foto(s) konnten nicht gespeichert werden. Bitte Fotos ggf. erneut aufnehmen.`
        );
        return;
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setSubmitError(err.message ?? "Unbekannter Fehler");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ ...S.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <CheckCircle2 size={64} color={C} style={{ marginBottom: 24 }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>
          Checkliste eingereicht
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 32, maxWidth: 320 }}>
          Die Gefahrgut-Checkliste{localKennzeichen ? <> für <strong style={{ color: "#f8fafc" }}>{localKennzeichen}</strong></> : ""} wurde erfolgreich übermittelt.
        </div>
        <button style={{ ...S.submitBtn, maxWidth: 320 }} onClick={() => setLocation("/scanner")}>
          NEUE CHECKLISTE
        </button>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {sigTarget && (
        <SignaturePad
          onConfirm={(dataUrl) => {
            if (sigTarget === "fahrer") setUnterschriftFahrer(dataUrl);
            else setUnterschriftVerlader(dataUrl);
            setSigTarget(null);
          }}
          onCancel={() => setSigTarget(null)}
        />
      )}

      {liveCameraOpen && (
        <LiveCamera
          onLog={addLog}
          onCapture={(file) => {
            cameraSupportedRef.current = true;
            setLiveCameraOpen(false);
            addPhotoFile(file);
          }}
          onCancel={() => {
            addLog("Live-Kamera abgebrochen");
            setLiveCameraOpen(false);
          }}
          onError={(message) => {
            cameraSupportedRef.current = false;
            setLiveCameraOpen(false);
            setPhotoUploadError(message);
            addLog("Fallback: Öffne nativen Datei-/Kamera-Dialog...");
            photoInputRef.current?.click();
          }}
        />
      )}

      <div style={S.header}>
        <button style={S.backBtn} onClick={() => setLocation("/scanner")}>
          <ChevronLeft size={16} /> Zurück
        </button>
        <div style={S.headerTitle}>
          <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            FB LOG – 016
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
            Checkliste Gefahrguttransporte
          </div>
          {kennzeichen && (
            <div style={{ fontSize: 12, color: C, fontWeight: 600, marginTop: 1 }}>
              {kennzeichen}
            </div>
          )}
        </div>
        <div style={{ width: 70 }} />
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span>Prüfpunkte</span>
          <div style={S.markAllRow}>
            <button style={S.markBtn("B")} onClick={() => markAll("b")}>(B) alle ✓</button>
            <button style={S.markBtn("V")} onClick={() => markAll("v")}>(V) alle ✓</button>
          </div>
        </div>

        <div style={{ ...S.colHeader, paddingLeft: 14, marginTop: 4 }}>
          <div style={{ width: 30 + 6 + 30, display: "flex", gap: 6 }}>
            <div style={S.colLabel}>B</div>
            <div style={S.colLabel}>V</div>
          </div>
          <div style={{ flex: 1 }} />
        </div>

        {ITEMS.map((item) => (
          <div key={item.id} style={S.checkRow}>
            <div style={S.checkboxes}>
              {item.cols.includes("b") ? (
                <button
                  style={S.checkBox(!!checks[`${item.id}_b`])}
                  onClick={() => toggle(`${item.id}_b`)}
                  title="Besatzung"
                >
                  {checks[`${item.id}_b`]
                    ? <CheckSquare size={16} color="#3b82f6" />
                    : <Square size={16} color="#2d4a6b" />}
                </button>
              ) : (
                <div style={{ width: 30, height: 30, flexShrink: 0 }} />
              )}
              {item.cols.includes("v") ? (
                <button
                  style={S.checkBox(!!checks[`${item.id}_v`])}
                  onClick={() => toggle(`${item.id}_v`)}
                  title="Verlader"
                >
                  {checks[`${item.id}_v`]
                    ? <CheckSquare size={16} color="#3b82f6" />
                    : <Square size={16} color="#2d4a6b" />}
                </button>
              ) : (
                <div style={{ width: 30, height: 30, flexShrink: 0 }} />
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={S.checkLabel}>
                <span style={{ color: "#475569", fontSize: 11, marginRight: 4 }}>{item.id}.</span>
                {item.text}
              </div>
              {item.specialInput === "adr" && (
                <input
                  type="month"
                  value={adrGueltigBis}
                  onChange={(e) => setAdrGueltigBis(e.target.value)}
                  style={{ ...S.input, marginTop: 6, fontSize: 14 }}
                  placeholder="MM.JJJJ"
                />
              )}
              {item.specialInput === "plomben" && (
                <input
                  value={plombenNr}
                  onChange={(e) => setPlombenNr(e.target.value)}
                  style={{ ...S.input, marginTop: 6, fontSize: 14 }}
                  placeholder="Plomben-Nr."
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Fahrzeugdaten</div>

        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>KFZ Kennzeichen</label>
          {kennzeichen ? (
            <FocusInput value={localKennzeichen} readOnly style={{ fontWeight: 700, color: C }} />
          ) : (
            <FocusInput
              value={localKennzeichen}
              onChange={(e) => setLocalKennzeichen(e.target.value.toUpperCase())}
              placeholder="z.B. MH-AB 1234"
              style={{ fontWeight: 700 }}
              autoCapitalize="characters"
            />
          )}
        </div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>ggf. Anhänger</label>
          <FocusInput
            value={anhaenger}
            onChange={(e) => setAnhaenger(e.target.value)}
            placeholder="Anhänger-Kennzeichen"
          />
        </div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Spedition</label>
          <FocusInput
            value={spedition}
            onChange={(e) => setSpedition(e.target.value)}
            placeholder="Spedition"
          />
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Fahrer</div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Name Fahrer</label>
          <FocusInput
            value={nameFahrer}
            onChange={(e) => setNameFahrer(e.target.value)}
            placeholder="Vor- und Nachname"
          />
        </div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Unterschrift Fahrer</label>
          <button
            style={{ ...S.sigBtn, ...(unterschriftFahrer ? S.sigBtnSigned : {}) }}
            onClick={() => setSigTarget("fahrer")}
          >
            {unterschriftFahrer ? (
              <><CheckCircle2 size={16} /> Unterschrift vorhanden (erneut erfassen)</>
            ) : (
              <><PenTool size={16} /> Unterschrift Fahrer erfassen</>
            )}
          </button>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Verlader</div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Name Verlader</label>
          <FocusInput
            value={nameVerlader}
            onChange={(e) => setNameVerlader(e.target.value)}
            placeholder="Vor- und Nachname"
          />
        </div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Datum</label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            style={S.input}
          />
        </div>
        <div style={S.fieldRow}>
          <label style={S.fieldLabel}>Unterschrift Verlader</label>
          <button
            style={{ ...S.sigBtn, ...(unterschriftVerlader ? S.sigBtnSigned : {}) }}
            onClick={() => setSigTarget("verlader")}
          >
            {unterschriftVerlader ? (
              <><CheckCircle2 size={16} /> Unterschrift vorhanden (erneut erfassen)</>
            ) : (
              <><PenTool size={16} /> Unterschrift Verlader erfassen</>
            )}
          </button>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Paletten</div>

        {/* Von COMET */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Von COMET</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            <div>
              <label style={S.numLabel}>Europaletten</label>
              <input type="number" min="0" value={vonCometEuro} onChange={(e) => setVonCometEuro(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={S.numLabel}>Ladungssich.</label>
              <input type="number" min="0" value={vonCometLasich} onChange={(e) => setVonCometLasich(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={{ ...S.numLabel, color: "#f59e0b" }}>davon Defekt</label>
              <input type="number" min="0" value={vonDefekte} onChange={(e) => setVonDefekte(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={{ ...S.numLabel, color: "#a78bfa" }}>Düsseldorfer</label>
              <input type="number" min="0" value={vonDuesseldorfer} onChange={(e) => setVonDuesseldorfer(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
          </div>
        </div>

        {/* An COMET */}
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>An COMET</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            <div>
              <label style={S.numLabel}>Europaletten</label>
              <input type="number" min="0" value={anCometEuro} onChange={(e) => setAnCometEuro(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={S.numLabel}>Ladungssich.</label>
              <input type="number" min="0" value={anCometLasich} onChange={(e) => setAnCometLasich(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={{ ...S.numLabel, color: "#f59e0b" }}>davon Defekt</label>
              <input type="number" min="0" value={anDefekte} onChange={(e) => setAnDefekte(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
            <div>
              <label style={{ ...S.numLabel, color: "#a78bfa" }}>Düsseldorfer</label>
              <input type="number" min="0" value={anDuesseldorfer} onChange={(e) => setAnDuesseldorfer(e.target.value)} style={S.numInput} placeholder="0" />
            </div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>
          <span>Foto der Ladung</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>(optional)</span>
        </div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
            "Ladung auf LKW" fotografieren und der Sendung zuordnen. Nicht erforderlich zum Abschicken.
          </div>

          {photos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {photos.map((photo, i) => (
                <div key={photo.objectPath + i} style={{ position: "relative", width: 84, height: 84 }}>
                  <img
                    src={photo.previewUrl}
                    alt={photo.fileName}
                    style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `1px solid ${BORDER}` }}
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    style={{
                      position: "absolute", top: -6, right: -6, width: 22, height: 22,
                      borderRadius: "50%", background: "#ef4444", border: "none",
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                    }}
                    title="Foto entfernen"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            style={{ display: "none" }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelected}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={openPhotoCapture}
            disabled={isUploadingPhoto}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "12px", borderRadius: 8,
              background: "transparent", border: `1px dashed ${BORDER}`,
              color: C, fontSize: 13, fontWeight: 600, cursor: "pointer",
              opacity: isUploadingPhoto ? 0.6 : 1,
            }}
          >
            {isUploadingPhoto ? (
              <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Foto wird hochgeladen...</>
            ) : photos.length > 0 ? (
              <><ImagePlus size={16} /> Weiteres Foto aufnehmen</>
            ) : (
              <><Camera size={16} /> Foto aufnehmen</>
            )}
          </button>

          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={isUploadingPhoto}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "10px", borderRadius: 8, marginTop: 8,
              background: "transparent", border: `1px dashed ${BORDER}`,
              color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer",
              opacity: isUploadingPhoto ? 0.6 : 1,
            }}
          >
            <ImagePlus size={14} /> Foto aus Galerie/Datei wählen (falls Kamera blockiert)
          </button>

          {photoUploadError && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} /> {photoUploadError}
            </div>
          )}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Bemerkungen</div>
        <div style={{ ...S.fieldRow, borderBottom: "none" }}>
          <label style={S.fieldLabel}>Bemerkungen für Lagerleiststand</label>
          <textarea
            value={bemerkungen}
            onChange={(e) => setBemerkungen(e.target.value)}
            style={S.textarea}
            placeholder="Bemerkungen..."
          />
        </div>
      </div>

      {submitError && (
        <div style={{
          margin: "12px 12px 0",
          padding: "12px 14px",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid #ef4444",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#f87171",
          fontSize: 13,
        }}>
          <AlertCircle size={16} /> {submitError}
        </div>
      )}

      <div style={{ margin: "16px 12px 0" }}>
        <button
          style={{ ...S.submitBtn, opacity: isSubmitting ? 0.7 : 1 }}
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            : <Send size={18} />}
          {isSubmitting ? "WIRD GESENDET..." : "CHECKLISTE ABSCHICKEN"}
        </button>
        <button style={S.resetBtn} onClick={() => setLocation("/scanner")}>
          <ChevronLeft size={16} /> ZURÜCK
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); }
        input::placeholder, textarea::placeholder { color: #334155; }
      `}</style>
    </div>
  );
}
