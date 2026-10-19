import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWvvnScannerStateQueryKey } from "@workspace/api-client-react";
import {
  lookupWvvnArticle, useAddWvvnItem, useCreateWvvnSession, useDeleteWvvnItem, useFinalizeWvvnSession,
  type WvvnLookup, type WvvnMode, type WvvnScannerState, type WvvnSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MODES, MODE_LABEL, errMsg, fmtDateTime, fmtNum, parseQty } from "./lib";

const newest = <T extends { id: number }>(a: T[]) => a.reduce<T | undefined>((m, x) => (!m || x.id > m.id ? x : m), undefined);

/** Erfassungsansicht – wird in App-Seite und Standalone-Scanner verwendet. */
export function ScanWorkspace({ state, canDelete, canFinish, canScan }: { state: WvvnScannerState; canDelete: boolean; canFinish: boolean; canScan: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<WvvnMode>("WERKSVERKAUF");
  const [netto, setNetto] = useState(false);
  const [kware, setKware] = useState(state.defaultKware);
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [pending, setPending] = useState<(WvvnLookup & { scanCode: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const lock = useRef(false);
  const reqRef = useRef<{ key: string; id: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanTiming = useRef({ started: 0, length: 0 });
  const submitRef = useRef<((code?: string) => Promise<void>) | null>(null);
  const cancelAutoScan = () => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = null;
  };
  useEffect(() => () => cancelAutoScan(), []);
  useEffect(() => { if (!code) scanTiming.current = { started: 0, length: 0 }; }, [code]);
  const create = useCreateWvvnSession();
  const add = useAddWvvnItem();
  const del = useDeleteWvvnItem();
  const fin = useFinalizeWvvnSession();

  const sessions = useMemo(() => state.sessions.filter((s) => s.status === "open").sort((x, y) => x.id - y.id), [state.sessions]);
  const locked = busy || !!pending;

  const current = sessions.find((s) => s.mode === mode && s.netto === netto && s.kware === kware) ?? null;
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
  const put = (s: WvvnSession) => { void patch(s); };

  const addItem = async (c: string, q: number) => {
    let s = current;
    if (!s) { s = await create.mutateAsync({ data: { mode, netto, kware } }); put(s); }
    const key = `${s.id}|${c}|${q}`;
    if (reqRef.current?.key !== key) reqRef.current = { key, id: crypto.randomUUID() };
    const res = await add.mutateAsync({ id: s.id, data: { code: c, quantity: q, requestId: reqRef.current.id } });
    reqRef.current = null;
    put(res);
    refresh();
    return res;
  };

  const submit = async (scannedCode?: string) => {
    if (lock.current || !canScan) return;
    const c = (scannedCode ?? code).trim().replace(/\s/g, "");
    if (!c && !pending) return;
    lock.current = true; setBusy(true); setError(""); setInfo("");
    try {
      if (pending) {
        const q = parseQty(qty);
        if (q == null) { setError("Ungültige Menge (Zahl > 0, Komma erlaubt)."); return; }
        const res = await addItem(pending.scanCode, q);
        const it = newest(res.items);
        setInfo(`${pending.article.number}: ${fmtNum(q)} ${pending.unit}${it ? ` = ${fmtNum(it.pieces)} Stk` : ""} erfasst`);
        setPending(null); setQty(""); setCode("");
      } else {
        const l = await lookupWvvnArticle({ code: c });
        if (l.autoAdd && state.autoAddEan) {
          const res = await addItem(c, 1);
          const it = newest(res.items);
          setInfo(`${l.article.number} ${l.article.name}: 1 ${l.unit}${it ? ` = ${fmtNum(it.pieces)} Stk` : ""} erfasst`);
          setCode("");
        } else {
          setPending({ ...l, scanCode: c }); setQty("");
        }
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      lock.current = false; setBusy(false);
      setTimeout(() => codeRef.current?.focus(), 0);
    }
  };
  useEffect(() => { submitRef.current = submit; });

  const remove = async (s: WvvnSession, itemId: number) => {
    if (lock.current || !window.confirm("Position wirklich entfernen?")) return;
    lock.current = true; setBusy(true); setError("");
    try { put(await del.mutateAsync({ id: s.id, itemId })); refresh(); } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  };
  const finish = async (s: WvvnSession) => {
    if (lock.current) return;
    if (s.items.length === 0) { setError("Leere Liste kann nicht abgeschlossen werden."); return; }
    if (!window.confirm(`Liste #${s.id} (${MODE_LABEL[s.mode]}, ${s.itemCount} Positionen, ${fmtNum(s.pieces)} Stk) abschließen?`)) return;
    lock.current = true; setBusy(true); setError("");
    try { const r = await fin.mutateAsync({ id: s.id }); await patch(r, true); refresh(); setInfo(`Liste #${s.id} abgeschlossen`); } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} className="h-12" disabled={locked} onClick={() => setMode(m)} data-testid={`button-mode-${m}`}>
              {MODE_LABEL[m]}{sessions.some((s) => s.mode === m) ? ` (${sessions.filter((s) => s.mode === m).length})` : ""}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><Switch disabled={locked} checked={netto} onCheckedChange={setNetto} data-testid="switch-netto" />Netto-Kunde</label>
          <label className="flex items-center gap-2"><Switch disabled={locked} checked={kware} onCheckedChange={setKware} data-testid="switch-kware" />K-Ware</label>
        </div>
        <p className="text-xs text-slate-500">Aktive Liste: {current ? `#${current.id}, ${current.itemCount} Positionen` : "wird beim ersten Scan angelegt"}. Netto kennzeichnet den Kunden, keinen Preis.</p>
      </div>

      {canScan && (
        <form className="rounded-lg border bg-white p-3 space-y-3" onSubmit={(e) => { e.preventDefault(); cancelAutoScan(); void submit(); }}>
          {!pending && (
            <div>
              <Label>Artikelnummer, EAN oder VE-EAN</Label>
              <Input ref={codeRef} autoFocus inputMode="text" autoComplete="off" className="h-12 text-lg" value={code}
                onChange={(e) => {
                  const value = e.target.value;
                  setCode(value); cancelAutoScan();
                  const now = performance.now(), timing = scanTiming.current;
                  if (!timing.started || value.length <= timing.length) timing.started = now;
                  timing.length = value.length;
                  if (value.length >= 6 && now - timing.started <= 300) {
                    scanTimer.current = setTimeout(() => { void submitRef.current?.(value); }, 120);
                  }
                }}
                onPaste={(e) => {
                  const value = e.clipboardData.getData("text").trim().replace(/\s/g, "");
                  if (!value) return;
                  e.preventDefault(); setCode(value); cancelAutoScan();
                  scanTimer.current = setTimeout(() => { void submitRef.current?.(value); }, 120);
                }}
                disabled={busy} data-testid="input-code" />
            </div>
          )}
          {pending && (
            <div className="space-y-2">
              <div className="rounded-md bg-slate-50 border p-2 text-sm">
                <div className="font-semibold" data-testid="text-pending-article">{pending.article.number} · {pending.article.name}</div>
                <div className="text-xs text-slate-500">Einheit: {pending.unit === "VE" ? `VE (${fmtNum(pending.article.veFactor)} Stk je VE)` : "Stück"}</div>
              </div>
              <Label>Menge in {pending.unit === "VE" ? "VE" : "Stück"}</Label>
              <Input autoFocus inputMode="decimal" className="h-12 text-lg" value={qty} onChange={(e) => setQty(e.target.value)} disabled={busy} data-testid="input-quantity" />
              {pending.unit === "VE" && parseQty(qty) != null && <p className="text-xs text-slate-600">= {fmtNum(parseQty(qty)! * pending.article.veFactor)} Stück</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="h-11 flex-1" disabled={busy} data-testid="button-submit-scan">{pending ? "Menge übernehmen" : "Suchen / Erfassen"}</Button>
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
              <div key={s.id} className={`rounded-lg border bg-white ${s.id === current?.id ? "ring-2 ring-slate-800" : ""}`} data-testid={`card-list-${s.id}`}>
                <div className="flex flex-wrap items-center gap-2 p-3 border-b">
                  <button disabled={locked} className="text-left font-medium text-sm disabled:opacity-50" onClick={() => { setMode(s.mode); setNetto(s.netto); setKware(s.kware); }} data-testid={`button-select-list-${s.id}`}>
                    Liste #{s.id}{s.netto ? " · Netto" : ""}{s.kware ? " · K-Ware" : ""}
                  </button>
                  <span className="text-xs text-slate-500">seit {fmtDateTime(s.createdAt)} · {s.itemCount} Pos. · {fmtNum(s.pieces)} Stk</span>
                  {canFinish && <Button size="sm" className="ml-auto" disabled={busy || s.items.length === 0} onClick={() => finish(s)} data-testid={`button-finish-${s.id}`}>Abschließen</Button>}
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
