import { useState, useMemo } from "react";
import { useCreatePalletMovement, useListSpeditionen } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const emptyForm = () => ({
  palettenscheinnummer: "",
  vonCometEuropaletten: 0,
  vonCometLadungssicherung: 0,
  vonDefektePaletten: 0,
  anCometEuropaletten: 0,
  anCometLadungssicherung: 0,
  anDefektePaletten: 0,
});

export function MovementDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: speditionen } = useListSpeditionen();

  const isCometUser = user?.role && ["comet_admin", "comet_leitstand", "comet_lager"].includes(user.role);

  const [speditionId, setSpeditionId] = useState(
    !isCometUser && user?.speditionId ? String(user.speditionId) : ""
  );
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [bemerkungen, setBemerkungen] = useState("");
  const [palletForm, setPalletForm] = useState(emptyForm());

  // Auto-calculated totals per side
  const vonTotal = useMemo(() =>
    palletForm.vonCometEuropaletten + palletForm.vonCometLadungssicherung - palletForm.vonDefektePaletten,
    [palletForm]);
  const anTotal = useMemo(() =>
    palletForm.anCometEuropaletten + palletForm.anCometLadungssicherung - palletForm.anDefektePaletten,
    [palletForm]);

  const calculatedAmount = vonTotal - anTotal;

  // Art wird automatisch ermittelt:
  // Beide Seiten haben Werte → Neutral (kein Saldeneffekt)
  // Nur Von COMET → Abgang, Nur An COMET → Zugang
  const movementType = (vonTotal > 0 && anTotal > 0)
    ? "neutral"
    : calculatedAmount > 0 ? "ausgang"
    : calculatedAmount < 0 ? "eingang"
    : "abstimmung";

  const absAmount = Math.abs(calculatedAmount);
  // Scheinnummer ist immer Pflicht außer bei reiner Abstimmung (beide Seiten 0)
  const requiresSchein = movementType !== "abstimmung";

  const handleReset = () => {
    setBemerkungen("");
    setPalletForm(emptyForm());
  };

  const createMutation = useCreatePalletMovement({
    mutation: {
      onSuccess: () => {
        toast({ title: "Buchung erfasst" });
        onOpenChange(false);
        handleReset();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Fehler beim Speichern";
        toast({ title: msg, variant: "destructive" });
      }
    }
  });

  const handleSave = () => {
    if (requiresSchein && !palletForm.palettenscheinnummer.trim()) {
      toast({ title: "Palettenscheinnummer ist erforderlich", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        speditionId: parseInt(speditionId),
        movementType: movementType as any,
        movementDate,
        amount: absAmount,
        bemerkungen: bemerkungen || undefined,
        palettenscheinnummer: palletForm.palettenscheinnummer || undefined,
        vonCometEuropaletten: palletForm.vonCometEuropaletten,
        vonCometLadungssicherung: palletForm.vonCometLadungssicherung,
        vonDefektePaletten: palletForm.vonDefektePaletten,
        anCometEuropaletten: palletForm.anCometEuropaletten,
        anCometLadungssicherung: palletForm.anCometLadungssicherung,
        anDefektePaletten: palletForm.anDefektePaletten,
      }
    });
  };

  const setPallet = (key: keyof ReturnType<typeof emptyForm>, value: number | string) =>
    setPalletForm(f => ({ ...f, [key]: value }));

  const availableSpeditionen = isCometUser
    ? speditionen
    : speditionen?.filter(s => s.id === user?.speditionId);

  const selectedSped = speditionen?.find(s => s.id === Number(speditionId));
  const selectedFaktor = (selectedSped as any)?.palletFaktor ?? 1;

  const isAbgang  = movementType === "ausgang";
  const isZugang  = movementType === "eingang";
  const isNeutral = movementType === "neutral";
  const amountColor = isAbgang ? "text-red-600" : isZugang ? "text-green-600" : isNeutral ? "text-blue-600" : "text-slate-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Buchung erfassen</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-4 py-2">
            {isCometUser && (
              <div className="space-y-2">
                <Label>Spedition</Label>
                <div className="flex gap-2 items-center">
                  <Select value={speditionId} onValueChange={setSpeditionId}>
                    <SelectTrigger><SelectValue placeholder="Spedition wählen" /></SelectTrigger>
                    <SelectContent>
                      {availableSpeditionen?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedFaktor > 1 && (
                    <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                      Faktor {selectedFaktor}:1
                    </span>
                  )}
                </div>
                {selectedFaktor > 1 && (
                  <p className="text-xs text-amber-700">
                    {selectedFaktor} Speditions-Paletten = 1 COMET-Palette. Defekte zählen nicht. Eingang wird {selectedFaktor}-fach gewertet.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Art</Label>
                <div className={`flex items-center h-9 rounded-md border px-3 text-sm font-medium select-none ${
                  isAbgang  ? "border-red-200 bg-red-50 text-red-700" :
                  isZugang  ? "border-green-200 bg-green-50 text-green-700" :
                  isNeutral ? "border-blue-200 bg-blue-50 text-blue-700" :
                  "border-slate-200 bg-slate-50 text-slate-400"
                }`}>
                  {isAbgang ? "Abgang (−)" : isZugang ? "Zugang (+)" : isNeutral ? "Neutral (±)" : "— wird berechnet —"}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
              </div>
            </div>

            {/* Palettenscheinnummer */}
            <div className="space-y-2">
              <Label>
                Palettenscheinnummer
                {requiresSchein && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                value={palletForm.palettenscheinnummer}
                onChange={(e) => setPallet("palettenscheinnummer", e.target.value)}
                placeholder={requiresSchein ? "Pflichtfeld" : "Nicht erforderlich bei Abstimmung"}
                disabled={!requiresSchein}
              />
            </div>

            {/* Von COMET */}
            <div className="rounded-md border border-slate-200 p-3 bg-slate-50 space-y-2">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Von COMET</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Europaletten</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.vonCometEuropaletten}
                    onChange={e => setPallet("vonCometEuropaletten", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Ladungssich.</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.vonCometLadungssicherung}
                    onChange={e => setPallet("vonCometLadungssicherung", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-amber-600">davon defekt</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.vonDefektePaletten}
                    onChange={e => setPallet("vonDefektePaletten", Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* An COMET */}
            <div className="rounded-md border border-slate-200 p-3 bg-slate-50 space-y-2">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">An COMET</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Europaletten</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.anCometEuropaletten}
                    onChange={e => setPallet("anCometEuropaletten", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Ladungssich.</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.anCometLadungssicherung}
                    onChange={e => setPallet("anCometLadungssicherung", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-amber-600">davon defekt</Label>
                  <Input type="number" min={0} className="h-8 text-sm"
                    value={palletForm.anDefektePaletten}
                    onChange={e => setPallet("anDefektePaletten", Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* Auto-calculated amount */}
            <div className={`rounded-md border-2 border-dashed p-4 bg-white ${isAbgang ? "border-red-200" : isZugang ? "border-green-200" : isNeutral ? "border-blue-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-0.5">Differenz (Menge)</div>
                  <div className="text-xs text-slate-400">
                    Von: {vonTotal} | An: {anTotal}
                  </div>
                  {absAmount > 0 && (
                    <div className={`text-xs font-medium mt-1 ${isAbgang ? "text-red-600" : isZugang ? "text-green-600" : "text-blue-600"}`}>
                      {isNeutral
                        ? calculatedAmount > 0
                          ? "Von > An → Saldo −" + absAmount + " (Abgang)"
                          : calculatedAmount < 0
                            ? "An > Von → Saldo +" + absAmount + " (Zugang)"
                            : "Von = An → kein Saldeneffekt"
                        : isAbgang
                          ? "Von COMET > An COMET → Abgang"
                          : "An COMET > Von COMET → Zugang"}
                    </div>
                  )}
                </div>
                <div className={`text-3xl font-bold tabular-nums ${amountColor}`}>
                  {absAmount}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bemerkung</Label>
              <Input value={bemerkungen} onChange={(e) => setBemerkungen(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending || !speditionId}>
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
