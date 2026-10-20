import { useRef, useState } from "react";
import { useDeleteWvvnSession, type WvvnSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMsg, fmtNum, MODE_LABEL, useInvalidateWvvn } from "./lib";

export function SessionDeletion({ session: s, onClose, onDone }: { session: WvvnSession; onClose: () => void; onDone: () => void }) {
  const revision = useRef(s.revision).current;
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const m = useDeleteWvvnSession();
  const inv = useInvalidateWvvn();
  const remove = () => {
    if (m.isPending) return;
    if (reason.trim().length < 3) { setError("Bitte einen Löschgrund mit mindestens 3 Zeichen angeben."); return; }
    if (s.reported && !ack) { setError("Bitte bestätigen, dass der bereits versandte Bericht unverändert bleibt."); return; }
    setError("");
    m.mutate({ id: s.id, data: { revision, reason: reason.trim(), acknowledgeReported: ack } }, {
      onSuccess: async () => { await inv(); onDone(); },
      onError: (e) => setError(errMsg(e)),
    });
  };
  return <Dialog open onOpenChange={(o) => !o && !m.isPending && onClose()}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Abgeschlossene Liste #{s.id} löschen?</DialogTitle></DialogHeader>
      <p className="text-sm">{MODE_LABEL[s.mode]} · {s.itemCount} Positionen · {fmtNum(s.pieces)} Stück{s.legacy ? " · Archiv" : ""}</p>
      <p className="text-sm text-red-800">Die gesamte Liste verschwindet aus dem Protokoll und wird nicht mehr in künftige Tagesberichte aufgenommen. Es gibt keine Wiederherstellung in der Oberfläche. Der ursprüngliche Stand und der Löschgrund bleiben im Prüfprotokoll erhalten.</p>
      {s.reported && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Diese Liste wurde bereits gemeldet. Der versandte Bericht bleibt unverändert; es wird keine automatische Korrekturmail verschickt.
        <label className="flex items-center gap-2 mt-2"><Switch checked={ack} disabled={m.isPending} onCheckedChange={setAck} data-testid="switch-ack-delete-reported" />Verstanden, trotzdem löschen</label>
      </div>}
      <div><Label htmlFor="wvvn-delete-reason">Löschgrund</Label><Input id="wvvn-delete-reason" value={reason} maxLength={1000} disabled={m.isPending} onChange={(e) => setReason(e.target.value)} data-testid="input-delete-reason" /></div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={m.isPending} onClick={onClose}>Abbrechen</Button>
        <Button variant="destructive" disabled={m.isPending} onClick={remove} data-testid="button-confirm-delete-session">{m.isPending ? "Wird gelöscht…" : "Liste endgültig löschen"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
