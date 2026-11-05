import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface CreationSpedition {
  id: number;
  name: string;
  canCreateShipment?: boolean;
}

export function needsSpeditionConfirmation(
  isCometUser: boolean,
  ownSpeditionId: number | null | undefined,
  speditionen: readonly CreationSpedition[] | undefined,
) {
  return !isCometUser && !!speditionen?.some(
    s => s.id !== ownSpeditionId && s.canCreateShipment,
  );
}

export function summarizeCreationSpeditionen(
  targetIds: readonly (number | null | undefined)[],
  speditionen: readonly CreationSpedition[] | undefined,
) {
  const counts = new Map<number | null | undefined, number>();
  for (const id of targetIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({
    id,
    name: speditionen?.find(s => s.id === id)?.name ?? `Spedition ${id ?? "unbekannt"}`,
    count,
  }));
}

export function SpeditionCreateConfirmation({ open, onOpenChange, targets, speditionen, ownSpeditionId, onTargetChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ReturnType<typeof summarizeCreationSpeditionen>;
  speditionen: readonly CreationSpedition[] | undefined;
  ownSpeditionId: number | null | undefined;
  onTargetChange: (previousId: number | null | undefined, nextId: number) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anlage als Spedition bestätigen</DialogTitle>
          <DialogDescription>
            Es liegt eine Speditionsfreigabe vor. Möchten Sie diese Verladungen wirklich für die folgenden Speditionen anlegen?
            {" "}Sie können die Spedition hier ändern. Die Auswahl gilt für alle Verladungen der jeweiligen Gruppe.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-60 overflow-y-auto space-y-2 text-sm">
          {targets.map(target => (
            <li key={target.id ?? "unknown"} className="break-words space-y-1">
              <span>{target.count} Verladung{target.count !== 1 ? "en" : ""}</span>
              <Select value={target.id == null ? "" : String(target.id)} onValueChange={value => onTargetChange(target.id, Number(value))}>
                <SelectTrigger aria-label={`Spedition für ${target.name}`}><SelectValue placeholder="Spedition wählen" /></SelectTrigger>
                <SelectContent>
                  {speditionen?.filter(s => s.id === ownSpeditionId || s.canCreateShipment).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zurück</Button>
          <Button onClick={onConfirm}>Ja, Verladungen anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
