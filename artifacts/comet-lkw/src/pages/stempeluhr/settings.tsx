import { useEffect, useState } from "react";
import { useGetClockSettings, useUpdateClockSettings, useGetClockTerminals, useUnlockClockTerminal, useRevokeClockTerminal, useGetClockTerminal, useLockClockTerminal } from "@workspace/api-client-react";
import type { ClockBreakRule } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { errMsg, terminalValidity, useInvalidateClock } from "./lib";

export function SettingsPanel() {
  const q = useGetClockSettings({ query: { queryKey: ["/api/stempeluhr/settings"] } as any });
  const save = useUpdateClockSettings(); const invalidate = useInvalidateClock();
  const [f, setF] = useState<{ updatedAt: string; earliest: string; latest: string; hours: string; deb: string; rules: { from: string; ded: string }[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const d = q.data;
  useEffect(() => { if (d && !f) setF({ updatedAt: d.updatedAt, earliest: d.earliestStart ?? "", latest: d.latestEnd ?? "", hours: d.terminalHours === null ? "unlimited" : String(d.terminalHours), deb: String(d.debounceSeconds), rules: d.breakRules.map((r) => ({ from: String(r.fromMinutes), ded: String(r.deductionMinutes) })) }); }, [d, f]);
  if (q.isLoading) return <Skeleton className="h-48" />;
  if (q.isError || !d) return <div className="text-sm text-red-700">Einstellungen nicht ladbar: {errMsg(q.error)} <Button size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div>;
  if (!f) return null;
  const submit = async () => {
    setMsg(null);
    if (f.hours !== "unlimited" && (!Number.isInteger(Number(f.hours)) || Number(f.hours) < 1 || Number(f.hours) > 168)) { setMsg({ ok: false, t: "Terminal-Laufzeit: 1–168 ganze Stunden oder Unbegrenzt wählen." }); return; }
    const rules: ClockBreakRule[] = f.rules.map((r) => ({ fromMinutes: Number(r.from), deductionMinutes: Number(r.ded) }));
    if (rules.some((r) => !Number.isFinite(r.fromMinutes) || !Number.isFinite(r.deductionMinutes))) { setMsg({ ok: false, t: "Pausenregeln: nur Zahlen" }); return; }
    try {
      const saved = await save.mutateAsync({ data: { earliestStart: f.earliest || null, latestEnd: f.latest || null, breakRules: rules, terminalHours: f.hours === "unlimited" ? null : Number(f.hours), debounceSeconds: Number(f.deb), updatedAt: f.updatedAt } });
      setF({ ...f, updatedAt: saved.updatedAt });
      invalidate(); setMsg({ ok: true, t: "Gespeichert. Zeitregeln gelten für neue Einträge, die Terminal-Laufzeit für neue Freischaltungen. Bestehende Freigaben bleiben unverändert; ein Gerät gegebenenfalls sperren und erneut freischalten." });
    } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
  };
  return (
    <div className="rounded-lg border bg-white p-4 space-y-4 max-w-2xl">
      <h2 className="font-semibold">Zeit- und Terminal-Einstellungen</h2>
      <p className="text-xs text-slate-500">Neue Einstellungen gelten nur für neue Einträge. Zeiten in Berlin.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Früheste Buchung</Label><Input type="time" value={f.earliest} onChange={(e) => setF({ ...f, earliest: e.target.value })} data-testid="input-earliest" /></div>
        <div><Label>Späteste Buchung</Label><Input type="time" value={f.latest} onChange={(e) => setF({ ...f, latest: e.target.value })} data-testid="input-latest" /></div>
        <div className="space-y-2"><Label>Terminal-Laufzeit</Label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.hours === "unlimited"} onCheckedChange={(value) => setF({ ...f, hours: value === true ? "unlimited" : String(d.terminalHours ?? 12) })} data-testid="check-terminal-unlimited" />Unbegrenzt</label>
          {f.hours !== "unlimited" && <Input aria-label="Terminal-Laufzeit in Stunden (1–168)" type="number" min={1} max={168} step={1} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} data-testid="input-terminal-hours" />}
        </div>
        <div><Label>Doppelscan-Sperre (Sekunden, 5-120)</Label><Input inputMode="numeric" value={f.deb} onChange={(e) => setF({ ...f, deb: e.target.value })} data-testid="input-debounce" /></div>
      </div>
      <p className="text-xs text-slate-500">Unbegrenzt gilt bis zum Sperren oder Widerrufen. Berechtigungsentzug und Benutzer-Deaktivierung sperren weiterhin den Zugang. Browserdaten oder Gerätefreigaben können durch den Browser gelöscht werden. Neue Laufzeiten gelten erst beim erneuten Freischalten.</p>
      <div className="space-y-2"><Label>Automatische Pause (ab Netto-Arbeitsminuten, Abzug in Minuten)</Label>
        {f.rules.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input aria-label="ab Minuten" inputMode="numeric" value={r.from} onChange={(e) => setF({ ...f, rules: f.rules.map((x, j) => j === i ? { ...x, from: e.target.value } : x) })} />
            <Input aria-label="Abzug" inputMode="numeric" value={r.ded} onChange={(e) => setF({ ...f, rules: f.rules.map((x, j) => j === i ? { ...x, ded: e.target.value } : x) })} />
            <Button size="icon" variant="ghost" aria-label="Regel entfernen" disabled={f.rules.length < 2} onClick={() => setF({ ...f, rules: f.rules.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
          </div>))}
        <Button size="sm" variant="outline" onClick={() => setF({ ...f, rules: [...f.rules, { from: "", ded: "" }] })}><Plus className="w-4 h-4 mr-1" />Regel</Button>
      </div>
      {msg && <div className={`text-sm rounded p-2 border ${msg.ok ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200"}`}>{msg.t}</div>}
      <Button onClick={submit} disabled={save.isPending} data-testid="button-save-settings">Speichern</Button>
    </div>
  );
}

export function TerminalPanel() {
  const list = useGetClockTerminals({ query: { queryKey: ["/api/stempeluhr/terminals"] } as any });
  const here = useGetClockTerminal({ query: { queryKey: ["/api/stempeluhr/terminal/status"] } as any });
  const unlock = useUnlockClockTerminal(); const revoke = useRevokeClockTerminal(); const lock = useLockClockTerminal();
  const invalidate = useInvalidateClock();
  const [label, setLabel] = useState(""); const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); invalidate(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-semibold">Dieses Gerät als Terminal freischalten</h2>
        <p className="text-sm text-slate-600">Nach der Freischaltung bleibt ein eigenes, geschütztes Terminal-Cookie auf diesem Gerät bestehen. Bitte melden Sie sich danach aus Ihrem Easy-Konto ab; Mitarbeiter stempeln ohne eigenes Login, das Terminal bleibt freigeschaltet. Öffnen Sie dann /stempeluhr-terminal.</p>
        {here.data?.unlocked
          ? <div className="text-sm flex flex-wrap gap-2 items-center">Dieses Gerät ist freigeschaltet: <b>{here.data.label}</b>, {terminalValidity(here.data.expiresAt)}
              <a href="/stempeluhr-terminal" className="underline" data-testid="link-open-terminal">Terminal öffnen</a>
              <Button size="sm" variant="outline" onClick={() => run(() => lock.mutateAsync(undefined))} data-testid="button-lock-here">Dieses Gerät sperren</Button></div>
          : <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label.trim()) run(async () => { await unlock.mutateAsync({ data: { label: label.trim() } }); setLabel(""); }); }}>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bezeichnung, z. B. Tor 2" maxLength={100} data-testid="input-terminal-label" />
              <Button type="submit" disabled={unlock.isPending || !label.trim()} data-testid="button-unlock">Freischalten</Button></form>}
        {err && <div className="text-sm text-red-700">{err}</div>}
      </div>
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold mb-2">Aktive Terminals</h2>
        {list.isLoading && <Skeleton className="h-16" />}
        {list.isError && <div className="text-sm text-red-700">{errMsg(list.error)} <Button size="sm" variant="outline" onClick={() => list.refetch()}>Erneut versuchen</Button></div>}
        {list.data && !list.data.length && <div className="text-sm text-slate-500">Keine aktiven Terminals.</div>}
        {list.data?.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-t py-2 text-sm" data-testid={`terminal-${t.id}`}>
            <div><b>{t.label}</b><div className="text-xs text-slate-500">{terminalValidity(t.expiresAt)}</div></div>
            <Button size="sm" variant="outline" disabled={t.id == null} onClick={() => run(() => revoke.mutateAsync({ id: t.id! }))} data-testid={`button-revoke-${t.id}`}>Widerrufen</Button>
          </div>))}
      </div>
    </div>
  );
}
