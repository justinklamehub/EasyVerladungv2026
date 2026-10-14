import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useGetClockTerminal, useLockClockTerminal, useStampClockTerminal } from "@workspace/api-client-react";
import type { ClockStampResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Lock, ScanLine, AlertTriangle, CheckCircle2 } from "lucide-react";
import { errMsg, fmtDateTime, fmtTime } from "./lib";

function beep(ok: boolean, action?: string) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx(); const t = ctx.currentTime;
    const seq = !ok ? [[160, 0, 0.5]] : action === "in" ? [[660, 0, 0.12], [880, 0.14, 0.18]] : [[880, 0, 0.12], [660, 0.14, 0.18]];
    for (const [f, s, d] of seq) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = ok ? "sine" : "sawtooth"; o.frequency.value = f; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination); o.start(t + s); o.stop(t + s + d);
    }
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio unavailable */ }
}

export default function StempeluhrTerminal() {
  const status = useGetClockTerminal({ query: { queryKey: ["/api/stempeluhr/terminal/status"], refetchInterval: 15000, retry: false } as any });
  const stamp = useStampClockTerminal();
  const lock = useLockClockTerminal();
  const [card, setCard] = useState("");
  const [result, setResult] = useState<ClockStampResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());
  const pending = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const unlocked = !!status.data?.unlocked;

  useEffect(() => { const i = setInterval(() => setNow(new Date().toISOString()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (unlocked) input.current?.focus(); }, [unlocked]);

  const showFor8 = (r: ClockStampResult | null, e: string | null) => {
    setResult(r); setError(e);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setResult(null); setError(null); }, 8000);
  };

  const submit = async () => {
    const cardNumber = card.trim();
    if (!cardNumber || pending.current) return;
    pending.current = true; setCard("");
    const requestId = crypto.randomUUID(); // one id per scan, never reused on a new attempt
    try {
      const r = await stamp.mutateAsync({ data: { cardNumber, requestId } });
      beep(true, r.action); showFor8(r, null);
    } catch (e) {
      beep(false); showFor8(null, errMsg(e));
      status.refetch();
    } finally { pending.current = false; input.current?.focus(); }
  };

  const doLock = async () => {
    try { await lock.mutateAsync(undefined); } catch (e) { showFor8(null, errMsg(e)); }
    window.clearTimeout(timer.current); setResult(null);
    status.refetch();
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-white flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <div className="text-7xl sm:text-8xl font-bold tabular-nums tracking-tight" data-testid="text-terminal-time">{fmtTime(now, true)}</div>
        <div className="text-slate-400 mt-1 text-sm">Berlin</div>
      </div>

      {status.isLoading && <div className="text-slate-400">Status wird geladen...</div>}
      {status.isError && <div className="rounded-lg bg-red-900/50 border border-red-500 p-4 text-sm flex gap-3 items-center">Status nicht erreichbar: {errMsg(status.error)}
        <Button size="sm" variant="outline" className="text-slate-900" onClick={() => status.refetch()}>Erneut versuchen</Button></div>}

      {status.data && !unlocked && (
        <div className="max-w-md w-full rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4 text-center" data-testid="panel-terminal-locked">
          <Lock className="w-10 h-10 mx-auto text-slate-400" />
          <h1 className="text-xl font-semibold">Stempeluhr gesperrt</h1>
          <p className="text-sm text-slate-300">Ein berechtigter Mitarbeiter muss dieses Gerät freischalten. Danach kann er sich aus seinem Easy-Konto abmelden; das Terminal bleibt freigeschaltet.</p>
          <div className="flex flex-col gap-2">
            <Link href="/login?redirect=/stempeluhr" className="inline-flex justify-center items-center rounded-md bg-white text-slate-900 px-4 py-2 text-sm font-medium" data-testid="link-terminal-login">Anmelden zum Freischalten</Link>
            <Link href="/stempeluhr" className="text-sm text-slate-300 underline" data-testid="link-terminal-module">Zum Stempeluhr-Modul</Link>
          </div>
        </div>
      )}

      {unlocked && (
        <div className="max-w-xl w-full space-y-5">
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
            <label className="flex items-center gap-2 text-slate-300 text-sm"><ScanLine className="w-5 h-5" />Karte scannen</label>
            <Input ref={input} value={card} onChange={(e) => setCard(e.target.value)} autoFocus autoComplete="off" inputMode="none"
              className="h-16 text-2xl bg-slate-800 border-slate-600 text-white" placeholder="Kartennummer" data-testid="input-card" />
            <Button type="submit" disabled={stamp.isPending || !card.trim()} className="w-full h-12" data-testid="button-stamp">Stempeln</Button>
          </form>

          <div className="min-h-[9rem]" aria-live="assertive">
            {result && (
              <div className={`rounded-xl p-5 text-center ${result.action === "in" ? "bg-emerald-600" : "bg-sky-600"}`} data-testid="result-success">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2" />
                <div className="text-3xl font-bold">{result.action === "in" ? "Gekommen" : "Gegangen"}</div>
                <div className="text-xl mt-1">{result.name}</div>
                <div className="text-sm mt-1 opacity-90">Gestempelt {fmtTime(result.time, true)} · Gebucht {fmtTime(result.bookedTime)}</div>
              </div>
            )}
            {error && (
              <div className="rounded-xl p-5 text-center bg-red-700" data-testid="result-error">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
                <div className="text-xl font-bold">Nicht gestempelt</div>
                <div className="text-sm mt-1">{error}</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-700 pt-3">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{status.data?.label} · gültig bis {fmtDateTime(status.data?.expiresAt)}</span>
            <Button size="sm" variant="outline" className="text-slate-900" onClick={doLock} disabled={lock.isPending} data-testid="button-lock"><Lock className="w-3 h-3 mr-1" />Sperren</Button>
          </div>
        </div>
      )}
    </div>
  );
}
