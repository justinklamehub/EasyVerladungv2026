import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useGetWvvnScannerState, useLockWvvnScanner, useUnlockWvvnScanner, getGetWvvnScannerStateQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanLine } from "lucide-react";
import { P, errMsg, fmtDateTime, useWvvnAccess } from "./lib";
import { ScanWorkspace } from "./scanner-core";

export default function WvvnScannerPage() {
  const { has } = useWvvnAccess();
  const qc = useQueryClient();
  const q = useGetWvvnScannerState({ query: { queryKey: getGetWvvnScannerStateQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true } });
  const unlock = useUnlockWvvnScanner();
  const lock = useLockWvvnScanner();
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const s = q.data;
  const deviceAuth = !!s?.device;
  const canDelete = deviceAuth || has(P.delete);
  const canFinish = deviceAuth || has(P.finish);

  const doUnlock = () => {
    setErr("");
    unlock.mutate({ data: { label: label.trim() } }, {
      onSuccess: (r) => { qc.setQueryData(getGetWvvnScannerStateQueryKey(), r); void q.refetch(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  const doLock = () => {
    if (!window.confirm("Dieses Gerät sperren?")) return;
    lock.mutate(undefined, { onSuccess: () => { void q.refetch(); }, onError: (e) => setErr(errMsg(e)) });
  };

  const unlockBox = has(P.devices) && (
    <div className="rounded-lg border bg-white p-3 space-y-2">
      <Label>Gerätebezeichnung</Label>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} placeholder="z. B. Handscanner Versand 1" data-testid="input-device-label" />
      <Button disabled={!label.trim() || unlock.isPending} onClick={doUnlock} data-testid="button-unlock-device">Dieses Gerät freigeben</Button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="w-full min-w-0 p-3 space-y-4">
        <header className="flex items-center gap-2">
          <ScanLine className="w-6 h-6 text-slate-600" />
          <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Werksverkauf / Vernichtung</h1>
            {deviceAuth && <p className="text-xs text-slate-500">Gerät: {s!.device!.label}{s!.device!.expiresAt ? ` · gültig bis ${fmtDateTime(s!.device!.expiresAt)}` : ""}</p>}</div>
          {deviceAuth && has(P.devices) && <Button size="sm" variant="outline" onClick={doLock} data-testid="button-lock-device">Sperren</Button>}
        </header>

        {q.isLoading && <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>}
        {q.isError && !s && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>Scannerstatus nicht ladbar: {errMsg(q.error)}</span><Button size="sm" variant="outline" onClick={() => q.refetch()} data-testid="button-retry">Erneut versuchen</Button></div>
        )}
        {q.isError && s && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Aktualisierung fehlgeschlagen ({errMsg(q.error)}). Angezeigt wird der letzte Stand.</div>}
        {s && !s.unlocked && (
          <div className="rounded-lg border bg-white p-5 space-y-3" data-testid="panel-locked">
            <h2 className="font-semibold text-slate-900">Dieses Gerät ist gesperrt</h2>
            <p className="text-sm text-slate-600">Berechtigtes Personal meldet sich auf diesem Gerät an und gibt es hier frei. Danach ist der Scanner ohne Anmeldung nutzbar.</p>
            <div className="flex gap-2">
              <Link href="/login" className="inline-flex items-center rounded-md border px-3 py-2 text-sm bg-white" data-testid="link-login">Anmelden</Link>
              <Button variant="outline" onClick={() => q.refetch()} data-testid="button-retry-locked">Erneut prüfen</Button>
            </div>
            {unlockBox}
          </div>
        )}
        {s && s.unlocked && (
          <>
            {!deviceAuth && unlockBox}
            <ScanWorkspace state={s} canScan canDelete={canDelete} canFinish={canFinish} />
          </>
        )}
      </div>
    </div>
  );
}
