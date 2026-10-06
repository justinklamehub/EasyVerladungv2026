import { useEffect, useState } from "react";
import { useSetEinlagerungShelfStatus } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useRefreshEinlagerung } from "../use-einlagerung";
import { errMsg, P, type Model } from "../lib";

export type ShelfAction = { shelfId: number; full: boolean };

export function ShelfStatusDialog({ action, model, has, onClose }: {
  action: ShelfAction | null; model: Model; has: (k: string) => boolean; onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const mutation = useSetEinlagerungShelfStatus();
  const refresh = useRefreshEinlagerung();
  const { toast } = useToast();
  useEffect(() => { setNote(""); }, [action?.shelfId, action?.full]);
  const shelf = action ? model.shelfById.get(action.shelfId) : undefined;
  const name = String(shelf?.d.name ?? "");
  const full = action?.full ?? true;

  const confirm = async () => {
    if (!action) return;
    const latest = model.shelfById.get(action.shelfId);
    if (!latest) { toast({ title: "Regal nicht mehr vorhanden", variant: "destructive" }); onClose(); return; }
    if (!has(action.full ? P.full : P.release)) { toast({ title: "Keine Berechtigung für diese Aktion", variant: "destructive" }); return; }
    if (!!latest.d.full === action.full) {
      toast({ title: action.full ? "Regal ist bereits als voll gemeldet" : "Regal ist bereits freigegeben" });
      onClose(); return;
    }
    try {
      await mutation.mutateAsync({ id: latest.id, data: { full: action.full, note: note.trim() || undefined } });
      toast({ title: action.full ? "Regal als voll gemeldet" : "Regal freigegeben" });
      refresh();
      onClose();
    } catch (e) {
      toast({ title: "Statuswechsel fehlgeschlagen", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!action} onOpenChange={(o) => { if (!o && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-shelf-status">
        <DialogHeader>
          <DialogTitle>{full ? "Regal voll melden" : "Regal freigeben"}</DialogTitle>
          <DialogDescription>
            {full ? `Regal ${name} wird als voll gekennzeichnet.` : `Die Vollmeldung für Regal ${name} wird aufgehoben.`}
            {" "}Bestände und Importdaten bleiben unverändert.
          </DialogDescription>
        </DialogHeader>
        <div className="text-xs text-slate-500">{model.shelfLabel(shelf)}</div>
        {full && <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Hinweis (optional)" aria-label="Hinweis zur Vollmeldung" disabled={mutation.isPending} data-testid="input-shelf-status-note" />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending} data-testid="button-shelf-status-cancel">Abbrechen</Button>
          <Button variant={full ? "destructive" : "default"} onClick={confirm} disabled={mutation.isPending} data-testid="button-shelf-status-confirm">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{full ? "Voll melden" : "Freigeben"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
