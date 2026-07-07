import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2, Search, Truck, AlertTriangle, CheckCircle2, Hash, ClipboardCheck, ChevronDown, ChevronUp, Save } from "lucide-react";

const API = "/api";

const S = {
  page: {
    minHeight: "100dvh",
    background: "#0d1b2a",
    color: "#e2e8f0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "24px 16px",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 32,
    marginTop: 16,
  },
  logo: {
    fontSize: 13,
    letterSpacing: "0.15em",
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f8fafc",
    letterSpacing: "0.02em",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: "#162032",
    border: "1px solid #1e3a5f",
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 8,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "0.05em",
    background: "#0d1b2a",
    border: "2px solid #b4ff00",
    borderRadius: 8,
    color: "#f8fafc",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  btnGreen: {
    width: "100%",
    padding: "16px",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.1em",
    background: "#b4ff00",
    color: "#0d1b2a",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  btnGray: {
    width: "100%",
    padding: "14px",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.08em",
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #2d4a6b",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1e3a5f",
    fontSize: 14,
  },
  infoLabel: { color: "#94a3b8" },
  infoValue: { color: "#f8fafc", fontWeight: 600 },
  statusBadge: (found: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: found ? "rgba(180,255,0,0.12)" : "rgba(239,68,68,0.12)",
    color: found ? "#b4ff00" : "#f87171",
    border: `1px solid ${found ? "#b4ff00" : "#f87171"}`,
    marginBottom: 16,
  }),
};

const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];
const WARE_OPTIONS = ["nicht bereit", "vorbereitet", "ausgedruckt"];
const TOR_OPTIONS = Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`);

const S_hint = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 6,
  textAlign: "center" as const,
};

type ShipmentInfo = {
  id: number;
  kennzeichen: string | null;
  bezeichnung: string | null;
  relation: string | null;
  status: string;
  tor: string | null;
  wareStatus: string | null;
} | null;

type ShipmentListItem = {
  id: number;
  bezeichnung: string | null;
  kennzeichen: string | null;
  relation: string | null;
  status: string;
  tor: string | null;
  speditionName: string | null;
};

export default function ScannerLandingPage() {
  const [idInput, setIdInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentInfo>(null);
  const [shipmentList, setShipmentList] = useState<ShipmentListItem[]>([]);
  const [spedition, setSpedition] = useState<string | null>(null);
  const [checklistCount, setChecklistCount] = useState(0);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editTor, setEditTor] = useState("");
  const [editWareStatus, setEditWareStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  async function doFetch(val: string) {
    setIsSearching(true);
    setSearched(false);
    setSearchError(null);
    setConfirmedDuplicate(false);
    setEditOpen(false);
    setSaveOk(false);
    setSaveError("");
    setShipmentList([]);
    try {
      const res = await fetch(`${API}/scanner/find-shipment?q=${encodeURIComponent(val)}&id=${encodeURIComponent(val)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSearchError(errData.error ?? `Serverfehler (${res.status})`);
        setShipment(null);
        setChecklistCount(0);
        setSearched(true);
        return;
      }
      const data = await res.json();
      // Trefferliste (Bezeichnung-Suche mit mehreren Ergebnissen)
      if (data.shipments && data.shipments.length > 0 && !data.shipment) {
        setShipmentList(data.shipments);
        setShipment(null);
        setChecklistCount(0);
        setSearched(true);
        return;
      }
      const s = data.found ? data.shipment : null;
      setShipment(s);
      setSpedition(data.spedition ?? null);
      setChecklistCount(data.checklistCount ?? 0);
      if (s) {
        setEditStatus(s.status ?? "");
        setEditTor(s.tor ?? "");
        setEditWareStatus(s.wareStatus ?? "");
      }
      setSearched(true);
    } catch (err: any) {
      setSearchError("Verbindungsfehler – bitte prüfen Sie die Netzwerkverbindung.");
      setShipment(null);
      setChecklistCount(0);
      setSearched(true);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const val = idInput.trim();
    if (!val) return;
    await doFetch(val);
  }

  async function selectFromList(item: ShipmentListItem) {
    setIdInput(String(item.id));
    await doFetch(String(item.id));
  }

  async function handleSave() {
    if (!shipment) return;
    setIsSaving(true);
    setSaveError("");
    setSaveOk(false);
    try {
      const res = await fetch(`${API}/scanner/shipment/${shipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, tor: editTor, wareStatus: editWareStatus }),
      });
      if (!res.ok) {
        let msg = "Fehler";
        try { msg = (await res.json()).error ?? msg; } catch { /* non-JSON error */ }
        throw new Error(msg);
      }
      setShipment((prev) => prev ? { ...prev, status: editStatus, tor: editTor || null, wareStatus: editWareStatus || null } : prev);
      setSaveOk(true);
      setEditOpen(false);
    } catch (err: any) {
      setSaveError(err.message ?? "Unbekannter Fehler");
    } finally {
      setIsSaving(false);
    }
  }

  function goToChecklist(ship: ShipmentInfo, sped: string | null) {
    const params = new URLSearchParams();
    if (ship) {
      params.set("shipmentId", String(ship.id));
      if (ship.kennzeichen) params.set("kennzeichen", ship.kennzeichen);
      if (ship.bezeichnung) params.set("bezeichnung", ship.bezeichnung);
    }
    if (sped) params.set("spedition", sped);
    setLocation(`/scanner/gefahrgut?${params.toString()}`);
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logo}>COMET LKW • Scanner</div>
        <div style={S.title}>Gefahrgut-Checkliste</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>FB LOG – 016</div>
      </div>

      {/* Blanko-Checkliste direkter Einstieg */}
      <div style={{ width: "100%", maxWidth: 480, marginBottom: 16 }}>
        <button
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.08em",
            background: "rgba(180,255,0,0.08)",
            color: "#b4ff00",
            border: "1.5px solid #b4ff00",
            borderRadius: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onClick={() => setLocation("/scanner/gefahrgut")}
        >
          <ClipboardCheck size={18} />
          BLANKO-CHECKLISTE (OHNE LKW-ID)
        </button>
        <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" as const, marginTop: 5 }}>
          Checkliste ohne Verladungs-ID ausfüllen
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 480, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 1, background: "#1e3a5f" }} />
        <span style={{ fontSize: 11, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>oder nach ID / Bezeichnung suchen</span>
        <div style={{ flex: 1, height: 1, background: "#1e3a5f" }} />
      </div>

      <div style={S.card}>
        <form onSubmit={handleSearch}>
          <label style={S.label}>LKW-ID oder Bezeichnung</label>
          <input
            ref={inputRef}
            style={S.input}
            type="text"
            inputMode="text"
            autoCorrect="off"
            autoCapitalize="off"
            value={idInput}
            onChange={(e) => {
              setIdInput(e.target.value);
              setSearched(false);
              setShipment(null);
              setShipmentList([]);
              setSearchError(null);
            }}
            placeholder='z.B. 42 oder "ACME Trans"'
            autoFocus
          />
          <div style={S_hint}>Numerische ID oder Bezeichnung (Freitext) eingeben</div>
          <button
            type="submit"
            style={S.btnGreen}
            disabled={isSearching || !idInput.trim()}
          >
            {isSearching
              ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              : <Search size={18} />}
            {isSearching ? "SUCHE..." : "VERLADUNG SUCHEN"}
          </button>
        </form>
      </div>

      {searched && shipmentList.length > 0 && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10, textAlign: "center" as const }}>
            <span style={{ color: "#b4ff00", fontWeight: 700 }}>{shipmentList.length}</span> Verladung{shipmentList.length !== 1 ? "en" : ""} gefunden – bitte auswählen:
          </div>
          {shipmentList.map((item) => (
            <button
              key={item.id}
              onClick={() => selectFromList(item)}
              style={{
                display: "block",
                width: "100%",
                background: "#162032",
                border: "1px solid #1e3a5f",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 10,
                cursor: "pointer",
                textAlign: "left" as const,
                color: "#f8fafc",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    {item.bezeichnung ?? `Verladung #${item.id}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", flexWrap: "wrap" as const, gap: "4px 12px" }}>
                    {item.kennzeichen && <span>🚛 {item.kennzeichen}</span>}
                    {item.relation && <span>📍 {item.relation}</span>}
                    {item.speditionName && <span>🏢 {item.speditionName}</span>}
                    {item.tor && <span>🚪 {item.tor}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>#{item.id}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: "rgba(180,255,0,0.1)", color: "#b4ff00", border: "1px solid #b4ff00",
                  }}>{item.status}</span>
                </div>
              </div>
            </button>
          ))}
          <button
            style={{ ...S.btnGray, marginTop: 4 }}
            onClick={() => { setSearched(false); setShipmentList([]); }}
          >
            ABBRECHEN
          </button>
        </div>
      )}

      {searched && shipmentList.length === 0 && (
        <div style={S.card}>
          {shipment ? (
            <>
              <div style={S.statusBadge(true)}>
                <CheckCircle2 size={13} />
                Verladung gefunden
              </div>
              <div style={S.infoRow}>
                <span style={S.infoLabel}>ID</span>
                <span style={{ ...S.infoValue, display: "flex", alignItems: "center", gap: 4 }}>
                  <Hash size={12} color="#64748b" />{shipment.id}
                </span>
              </div>
              {shipment.kennzeichen && (
                <div style={S.infoRow}>
                  <span style={S.infoLabel}>Kennzeichen</span>
                  <span style={S.infoValue}>{shipment.kennzeichen}</span>
                </div>
              )}
              {shipment.bezeichnung && (
                <div style={S.infoRow}>
                  <span style={S.infoLabel}>Bezeichnung</span>
                  <span style={S.infoValue}>{shipment.bezeichnung}</span>
                </div>
              )}
              {shipment.relation && (
                <div style={S.infoRow}>
                  <span style={S.infoLabel}>Relation</span>
                  <span style={S.infoValue}>{shipment.relation}</span>
                </div>
              )}
              {spedition && (
                <div style={S.infoRow}>
                  <span style={S.infoLabel}>Spedition</span>
                  <span style={S.infoValue}>{spedition}</span>
                </div>
              )}
              <div style={{ ...S.infoRow, borderBottom: "none" }}>
                <span style={S.infoLabel}>Status</span>
                <span style={S.infoValue}>{shipment.status}</span>
              </div>
              {shipment.tor && (
                <div style={{ ...S.infoRow, borderBottom: "none", marginTop: -8 }}>
                  <span style={S.infoLabel}>Tor</span>
                  <span style={S.infoValue}>{shipment.tor}</span>
                </div>
              )}
              {shipment.wareStatus && (
                <div style={{ ...S.infoRow, borderBottom: "none", marginTop: -8 }}>
                  <span style={S.infoLabel}>Ware</span>
                  <span style={S.infoValue}>{shipment.wareStatus}</span>
                </div>
              )}

              {/* Save-Feedback */}
              {saveOk && (
                <div style={{ background: "rgba(180,255,0,0.1)", border: "1px solid #b4ff00", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#b4ff00", marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={15} /> Änderungen gespeichert
                </div>
              )}

              {/* Angaben ändern */}
              <button
                style={{ ...S.btnGray, marginTop: 12, justifyContent: "space-between" }}
                onClick={() => { setEditOpen(o => !o); setSaveOk(false); setSaveError(""); }}
              >
                <span>ANGABEN ÄNDERN</span>
                {editOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {editOpen && (
                <div style={{ marginTop: 12, background: "rgba(30,58,95,0.4)", border: "1px solid #2d4a6b", borderRadius: 8, padding: "14px 14px 10px" }}>
                  {/* Status */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...S.label, marginBottom: 6 }}>Status</label>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setEditStatus(opt)}
                          style={{
                            padding: "7px 13px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                            background: editStatus === opt ? "#b4ff00" : "transparent",
                            color: editStatus === opt ? "#0d1b2a" : "#94a3b8",
                            border: editStatus === opt ? "1.5px solid #b4ff00" : "1.5px solid #2d4a6b",
                          }}
                        >{opt}</button>
                      ))}
                    </div>
                  </div>

                  {/* Ware-Status */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...S.label, marginBottom: 6 }}>Ware-Status</label>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                      {WARE_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          onClick={() => setEditWareStatus(prev => prev === opt ? "" : opt)}
                          style={{
                            padding: "7px 13px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                            background: editWareStatus === opt ? "#b4ff00" : "transparent",
                            color: editWareStatus === opt ? "#0d1b2a" : "#94a3b8",
                            border: editWareStatus === opt ? "1.5px solid #b4ff00" : "1.5px solid #2d4a6b",
                          }}
                        >{opt}</button>
                      ))}
                    </div>
                  </div>

                  {/* Tor */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ ...S.label, marginBottom: 6 }}>Tor</label>
                    <select
                      value={editTor}
                      onChange={e => setEditTor(e.target.value)}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 15, background: "#0d1b2a", color: editTor ? "#f1f5f9" : "#64748b", border: "1.5px solid #2d4a6b", appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
                    >
                      <option value="">— Kein Tor —</option>
                      {TOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  {saveError && (
                    <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{saveError}</div>
                  )}

                  <button
                    style={{ ...S.btnGreen, marginTop: 4 }}
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={17} />}
                    {isSaving ? "WIRD GESPEICHERT..." : "SPEICHERN"}
                  </button>
                </div>
              )}

              {checklistCount > 0 && !confirmedDuplicate ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid #f59e0b",
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}>
                    <ClipboardCheck size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 3 }}>
                        Checkliste bereits vorhanden
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>
                        Für diese Verladung {checklistCount === 1 ? "wurde bereits 1 Checkliste" : `wurden bereits ${checklistCount} Checklisten`} eingereicht. Soll trotzdem eine weitere ausgefüllt werden?
                      </div>
                    </div>
                  </div>
                  <button style={S.btnGreen} onClick={() => setConfirmedDuplicate(true)}>
                    <Truck size={18} />
                    JA, WEITERE CHECKLISTE AUSFÜLLEN
                  </button>
                  <button style={S.btnGray} onClick={() => { setSearched(false); setShipment(null); }}>
                    ABBRECHEN
                  </button>
                </div>
              ) : (
                <button style={{ ...S.btnGreen, marginTop: 14 }} onClick={() => goToChecklist(shipment, spedition)}>
                  <Truck size={18} />
                  CHECKLISTE AUSFÜLLEN
                </button>
              )}
            </>
          ) : (
            <>
              <div style={S.statusBadge(false)}>
                <AlertTriangle size={13} />
                {searchError ? "Serverfehler" : "Keine Verladung gefunden"}
              </div>
              {searchError ? (
                <p style={{ fontSize: 14, color: "#f87171", margin: "0 0 16px 0" }}>
                  {searchError}
                </p>
              ) : (
                <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 16px 0" }}>
                  Keine Verladung für <strong style={{ color: "#f8fafc" }}>„{idInput.trim()}"</strong> gefunden.
                  Sie können die Checkliste trotzdem manuell ausfüllen.
                </p>
              )}
              <button style={S.btnGreen} onClick={() => goToChecklist(null, null)}>
                <Truck size={18} />
                CHECKLISTE TROTZDEM AUSFÜLLEN
              </button>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
