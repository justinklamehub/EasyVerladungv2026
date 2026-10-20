import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetWvvnScannerStateQueryKey, lookupWvvnArticle, useAddWvvnItem, useCreateWvvnSession, useDeleteWvvnItem, useFinalizeWvvnSession,
  type WvvnLookup, type WvvnMode, type WvvnScannerState, type WvvnSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MODES, MODE_LABEL, catLabel, errMsg, fmtDateTime, fmtNum, parseQty } from "./lib";

type Method = "scan" | "manual";
type Ctx = { id: number; mode: WvvnMode; kware: boolean; netto: boolean };
const newest = <T extends { id: number }>(a: T[]) => a.reduce<T | undefined>((m, x) => (!m || x.id > m.id ? x : m), undefined);

/** Erfassungsansicht – wird in App-Seite und Standalone-Scanner verwendet. */
export function ScanWorkspace({ state, canDelete, canFinish, canScan }: { state: WvvnScannerState; canDelete: boolean; canFinish: boolean; canScan: boolean }) {
  const qc = useQueryClient();
  const [selMode, setSelMode] = useState<WvvnMode | null>(null);
  const [selCat, setSelCat] = useState<"kware" | "retoure" | null>(null);
  const [selNetto, setSelNetto] = useState(false);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [inputKind, setInputKind] = useState<Method | "auto">("auto");
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [pending, setPending] = useState<(WvvnLookup & { scanCode: string; method: Method }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const lock = useRef(false);
  const pasted = useRef(false);
  const keyTiming = useRef({ count: 0, last: 0 });
  const reqRef = useRef<{ key: string; id: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const observedContext = useRef<number | null>(null);
  const create = useCreateWvvnSession();
  const add = useAddWvvnItem();
  const del = useDeleteWvvnItem();
  const fin = useFinalizeWvvnSession();

  const sessions = useMemo(() => state.sessions.filter((s) => s.status === "open").sort((x, y) => x.id - y.id), [state.sessions]);
  const current = ctx ? sessions.find((s) => s.id === ctx.id) ?? null : null;
  const refresh = () => qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes("/api/wvvn/") });
  const patch = async (s: WvvnSession, remove = false) => {
    const key = getGetWvvnScannerStateQueryKey();
    await qc.cancelQueries({ queryKey: key });
    qc.setQueryData<WvvnScannerState>(key, (old) => {
      if (!old) return old;
      const rest = old.sessions.filter((x) => x.id !== s.id);
      return { ...old, sessions: remove ? rest : [...rest, s] };
    });
  };
  // Liste im Hintergrund abgeschlossen/entfernt: Kontext verlassen
  useEffect(() => {
    if (!ctx) { observedContext.current = null; return; }
    if (current) { observedContext.current = ctx.id; return; }
    // A cache mutation and the parent's query render need not commit together.
    // Absence only proves removal after this context was actually observed.
    if (observedContext.current === ctx.id && !busy && !create.isPending) {
      setCtx(null); setPending(null); setError("Die aktive Liste ist nicht mehr offen. Bitte neuen Vorgang wählen.");
    }
  }, [ctx, current, busy, create.isPending]);

  const resetSelection = () => { setCtx(null); setPending(null); setQty(""); setCode(""); setSelMode(null); setSelCat(null); setSelNetto(false); setError(""); };

  const start = async () => {
    if (lock.current || !selMode || !selCat) return;
    lock.current = true; setBusy(true); setError(""); setInfo("");
    try {
      const kware = selCat === "kware";
      const s = await create.mutateAsync({ data: { mode: selMode, netto: selNetto, kware } });
      await patch(s);
      setCtx({ id: s.id, mode: s.mode, kware: s.kware, netto: s.netto });
      refresh();
    } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  };
  const resume = (s: WvvnSession) => {
    if (busy) return;
    setPending(null); setQty(""); setCode(""); setError(""); setInfo("");
    setCtx({ id: s.id, mode: s.mode, kware: s.kware, netto: s.netto });
  };
  const switchContext = () => {
    if (busy) return;
    if ((pending || code.trim()) && !window.confirm("Nicht übernommene Eingabe verwerfen und Vorgang wechseln? Die Liste bleibt erhalten.")) return;
    setCtx(null); setPending(null); setQty(""); setCode(""); setError(""); setInfo("");
  };

  const addItem = async (sessionId: number, c: string, q: number, method: Method) => {
    const key = `${sessionId}|${c}|${q}|${method}`;
    if (reqRef.current?.key !== key) reqRef.current = { key, id: crypto.randomUUID() };
    const res = await add.mutateAsync({ id: sessionId, data: { code: c, quantity: q, requestId: reqRef.current.id, inputMethod: method } });
    reqRef.current = null;
    await patch(res);
    refresh();
    return res;
  };

  const submit = async (method: Method) => {
    if (lock.current || !canScan || !ctx || !current) return;
    const c = code.trim().replace(/\s/g, "");
    if (!c && !pending) return;
    lock.current = true; setBusy(true); setError(""); setInfo("");
    try {
      if (pending) {
        const q = parseQty(qty);
        if (q == null) { setError("Ungültige Menge (Zahl > 0, max. 3 Nachkommastellen, Komma)."); return; }
        const res = await addItem(current.id, pending.scanCode, q, pending.method);
        const it = newest(res.items);
        setInfo(`${pending.article.number}: ${fmtNum(q)} ${pending.unit}${it ? ` = ${fmtNum(it.pieces)} Stk` : ""} erfasst`);
        setPending(null); setQty(""); setCode("");
      } else {
        const l = await lookupWvvnArticle({ code: c, sessionId: current.id, inputMethod: method });
        if (method === "scan" && l.autoAdd) {
          const res = await addItem(current.id, c, 1, "scan");
          const it = newest(res.items);
          setInfo(`${l.article.number} ${l.article.name}: 1 ${l.unit}${it ? ` = ${fmtNum(it.pieces)} Stk` : ""} erfasst`);
          setCode("");
        } else {
          setPending({ ...l, scanCode: c, method }); setQty("");
        }
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      pasted.current = false;
      keyTiming.current = { count: 0, last: 0 };
      lock.current = false; setBusy(false);
      setTimeout(() => codeRef.current?.focus(), 0);
    }
  };

  const remove = async (s: WvvnSession, itemId: number) => {
    if (lock.current || !window.confirm("Position wirklich entfernen?")) return;
    lock.current = true; setBusy(true); setError("");
    try { await patch(await del.mutateAsync({ id: s.id, itemId })); refresh(); } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  };
  const finish = async (s: WvvnSession) => {
    if (lock.current) return;
    if (s.items.length === 0) { setError("Leere Liste kann nicht abgeschlossen werden."); return; }
    if (!window.confirm(`Liste #${s.id} (${MODE_LABEL[s.mode]}, ${catLabel(s.kware)}, ${s.itemCount} Positionen, ${fmtNum(s.pieces)} Stk) abschließen?`)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const r = await fin.mutateAsync({ id: s.id });
      await patch(r, true);
      if (ctx?.id === s.id) resetSelection();
      refresh(); setInfo(`Liste #${s.id} abgeschlossen`);
    } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  };

  const tag = (s: { mode: WvvnMode; kware: boolean; netto: boolean }) => `${MODE_LABEL[s.mode]} · ${catLabel(s.kware)}${s.netto ? " · Netto" : ""}`;

  return (
    <div className="space-y-4">
      {!ctx && canScan && (
        <div className="rounded-lg border bg-white p-3 space-y-3" data-testid="panel-start">
          <h2 className="text-sm font-semibold text-slate-800">Vorgang wählen</h2>
          <div>
            <Label>Modus</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {MODES.map((m) => <Button key={m} variant={selMode === m ? "default" : "outline"} className="h-12" disabled={busy} onClick={() => setSelMode(m)} data-testid={`button-mode-${m}`}>{MODE_LABEL[m]}</Button>)}
            </div>
          </div>
          <div>
            <Label>Kategorie</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button variant={selCat === "kware" ? "default" : "outline"} className="h-12" disabled={busy} onClick={() => setSelCat("kware")} data-testid="button-cat-kware">K-Ware</Button>
              <Button variant={selCat === "retoure" ? "default" : "outline"} className="h-12" disabled={busy} onClick={() => setSelCat("retoure")} data-testid="button-cat-retoure">Retoure</Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch disabled={busy} checked={selNetto} onCheckedChange={setSelNetto} data-testid="switch-netto" />Netto-Kunde (Kennzeichen, kein Preis)</label>
          <Button className="h-11 w-full" disabled={busy || !selMode || !selCat} onClick={start} data-testid="button-start">Vorgang starten / fortsetzen</Button>
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" data-testid="text-scan-error">{error}</div>}
          {info && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800" data-testid="text-scan-info">{info}</div>}
        </div>
      )}

      {ctx && canScan && (
        <form className="rounded-lg border bg-white p-3 space-y-3" onSubmit={(e) => e.preventDefault()}>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-sm"><span className="font-semibold" data-testid="text-context">{tag(ctx)}</span><span className="text-xs text-slate-500"> · Liste #{ctx.id}</span></div>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={switchContext} data-testid="button-switch-context">Vorgang wechseln</Button>
          </div>
          {!pending && (
            <>
              <div>
                <Label>Eingabeart</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Button type="button" size="sm" variant={inputKind === "auto" ? "default" : "outline"} onClick={() => setInputKind("auto")} data-testid="button-kind-auto">Automatisch</Button>
                  <Button type="button" size="sm" variant={inputKind === "scan" ? "default" : "outline"} onClick={() => setInputKind("scan")} data-testid="button-kind-scan">Scanner</Button>
                  <Button type="button" size="sm" variant={inputKind === "manual" ? "default" : "outline"} onClick={() => setInputKind("manual")} data-testid="button-kind-manual">Manuell</Button>
                </div>
                <p className="text-xs text-slate-500 mt-1">{inputKind === "auto" ? "Schnelle Handscanner-Eingaben mit Enter werden erkannt: EAN = 1 Stück, VE-EAN = 1 VE. Tippen, Einfügen oder „Suchen“ fragt die Menge ab. Bei nicht erkannten Scannern „Scanner“ wählen." : inputKind === "scan" ? "Handscanner mit Enter: EAN = 1 Stück, VE-EAN = 1 VE; Artikelnummern fragen die Menge ab. Zum Tippen bitte „Manuell“ wählen." : "Bei manueller Eingabe wird immer die Menge abgefragt."}</p>
              </div>
              <div>
                <Label>Artikelnummer, EAN oder VE-EAN</Label>
                <Input ref={codeRef} autoFocus autoComplete="off" className="h-12 text-lg" value={code} disabled={busy} data-testid="input-code"
                  onChange={(e) => { setCode(e.target.value); if (!e.target.value) { keyTiming.current = { count: 0, last: 0 }; pasted.current = false; } }}
                  onPaste={() => { pasted.current = true; keyTiming.current.count = 0; }}
                  onKeyDown={(e) => {
                    const now = performance.now(), t = keyTiming.current;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const scan = !pasted.current && (inputKind === "scan" || inputKind === "auto" && t.count >= 6 && now - t.last < 120);
                      void submit(scan ? "scan" : "manual");
                    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      t.count = now - t.last <= 40 ? t.count + 1 : 1;
                      t.last = now;
                    } else { t.count = 0; }
                  }} />
              </div>
            </>
          )}
          {pending && (
            <div className="space-y-2">
              <div className="rounded-md bg-slate-50 border p-2 text-sm">
                <div className="font-semibold" data-testid="text-pending-article">{pending.article.number} · {pending.article.name}</div>
                <div className="text-xs text-slate-500">Einheit: {pending.unit === "VE" ? `VE (${fmtNum(pending.article.veFactor)} Stk je VE)` : "Stück"}</div>
              </div>
              <Label>Menge in {pending.unit === "VE" ? "VE" : "Stück"}</Label>
              <Input autoFocus inputMode="decimal" className="h-12 text-lg" value={qty} onChange={(e) => setQty(e.target.value)} disabled={busy}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(pending.method); } }} data-testid="input-quantity" />
              {pending.unit === "VE" && parseQty(qty) != null && <p className="text-xs text-slate-600">= {fmtNum(parseQty(qty)! * pending.article.veFactor)} Stück</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" className="h-11 flex-1" disabled={busy} onClick={() => void submit(pending ? pending.method : "manual")} data-testid="button-submit-scan">{pending ? "Menge übernehmen" : "Suchen"}</Button>
            {pending && <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => { setPending(null); setQty(""); setError(""); }} data-testid="button-cancel-pending">Abbrechen</Button>}
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" data-testid="text-scan-error">{error}</div>}
          {info && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800" data-testid="text-scan-info">{info}</div>}
        </form>
      )}
      {!canScan && error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {sessions.length === 0 && <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500" data-testid="text-no-lists">Keine offenen Listen auf diesem Gerät.</div>}
      {MODES.map((m) => {
        const list = sessions.filter((s) => s.mode === m);
        if (!list.length) return null;
        return (
          <section key={m} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">{MODE_LABEL[m]}</h2>
            {list.map((s) => (
              <div key={s.id} className={`rounded-lg border bg-white ${s.id === ctx?.id ? "ring-2 ring-slate-800" : ""}`} data-testid={`card-list-${s.id}`}>
                <div className="flex flex-wrap items-center gap-2 p-3 border-b">
                  <span className="font-medium text-sm">Liste #{s.id} · {catLabel(s.kware)}{s.netto ? " · Netto" : ""}</span>
                  <span className="text-xs text-slate-500">seit {fmtDateTime(s.createdAt)} · {s.itemCount} Pos. · {fmtNum(s.pieces)} Stk</span>
                  <div className="ml-auto flex gap-2">
                    {canScan && s.id !== ctx?.id && <Button size="sm" variant="outline" disabled={busy || !!pending} onClick={() => { if (!ctx || window.confirm(`Zu Liste #${s.id} wechseln?`)) resume(s); }} data-testid={`button-select-list-${s.id}`}>Fortsetzen</Button>}
                    {canFinish && <Button size="sm" disabled={busy || s.items.length === 0} onClick={() => finish(s)} data-testid={`button-finish-${s.id}`}>Abschließen</Button>}
                  </div>
                </div>
                {s.items.length === 0 ? <div className="p-3 text-xs text-slate-500">Noch keine Positionen.</div> : (
                  <ul className="divide-y">
                    {[...s.items].reverse().map((it) => (
                      <li key={it.id} className="flex items-center gap-2 p-2 text-sm" data-testid={`row-item-${it.id}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{it.articleNumber} · {it.articleName}</div>
                          <div className="text-xs text-slate-500">{fmtNum(it.quantity)} {it.unit}{it.unit === "VE" ? ` × ${fmtNum(it.veFactor)}` : ""} = <b>{fmtNum(it.pieces)} Stk</b> · Code {it.scannedCode}</div>
                        </div>
                        {canDelete && <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(s, it.id)} data-testid={`button-delete-item-${it.id}`}>Entfernen</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
