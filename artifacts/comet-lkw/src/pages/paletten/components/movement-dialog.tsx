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

  // Special booking modes (mutually exclusive)
  const [specialMode, setSpecialMode] = useState<"anfangsbestand" | "abstimmung" | "abschreibung" | null>(null);
  const isAnfangsbestandMode = specialMode === "anfangsbestand";
  const isAbstimmungMode = specialMode === "abstimmung";
  const isAbschreibungMode = specialMode === "abschreibung";
  const [anfangsbestandYear, setAnfangsbestandYear] = useState(new Date().getFullYear());
  const [anfangsbestandBetrag, setAnfangsbestandBetrag] = useState<number | "">(0);
  const [abstimmungDate, setAbstimmungDate] = useState(new Date().toISOString().slice(0, 10));
  const [abstimmungBetrag, setAbstimmungBetrag] = useState<number | "">(0);
  const [abschreibungDate, setAbschreibungDate] = useState(new Date().toISOString().slice(0, 10));
  const [abschreibungBetrag, setAbschreibungBetrag] = useState<number | "">(0);

  // Gross = euro + ladungssicherung (ohne Defekte-Abzug)
  // Net  = gross - defekte (für Anzeige und amount-Feld)
  const vonGross = useMemo(() =>
    palletForm.vonCometEuropaletten + palletForm.vonCometLadungssicherung,
    [palletForm]);
  const anGross = useMemo(() =>
    palletForm.anCometEuropaletten + palletForm.anCometLadungssicherung,
    [palletForm]);
  const vonTotal = useMemo(() =>
    vonGross - palletForm.vonDefektePaletten,
    [vonGross, palletForm.vonDefektePaletten]);
  const anTotal = useMemo(() =>
    anGross - palletForm.anDefektePaletten,
    [anGross, palletForm.anDefektePaletten]);

  const calculatedAmount = vonTotal - anTotal;

  // Art wird automatisch ermittelt — WICHTIG: anhand der Brutto-Mengen,
  // damit "alle defekt" auf Von-Seite trotzdem als Neutral erkannt wird.
  // Nur Von COMET (brutto) → Abgang, Nur An COMET (brutto) → Zugang
  // Beide Seiten (brutto) → Neutral
  const movementType = (vonGross > 0 && anGross > 0)
    ? "neutral"
    : vonGross > 0 ? "ausgang"
    : anGross > 0 ? "eingang"
    : "abstimmung";

  // Scheinnummer ist immer Pflicht außer bei reiner Abstimmung (beide Seiten 0)
  const requiresSchein = movementType !== "abstimmung";

  const handleReset = () => {
    setBemerkungen("");
    setPalletForm(emptyForm());
    setSpecialMode(null);
    setAnfangsbestandBetrag(0);
    setAnfangsbestandYear(new Date().getFullYear());
    setAbstimmungBetrag(0);
    setAbstimmungDate(new Date().toISOString().slice(0, 10));
    setAbschreibungBetrag(0);
    setAbschreibungDate(new Date().toISOString().slice(0, 10));
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
    if (isAnfangsbestandMode) {
      if (!speditionId) {
        toast({ title: "Spedition wählen", variant: "destructive" });
        return;
      }
      const betrag = Number(anfangsbestandBetrag);
      if (isNaN(betrag)) {
        toast({ title: "Ungültiger Betrag", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        data: {
          speditionId: parseInt(speditionId),
          movementType: "anfangsbestand" as any,
          movementDate: `${anfangsbestandYear}-01-01`,
          amount: betrag,
          bemerkungen: bemerkungen || undefined,
        }
      });
      return;
    }
    if (isAbstimmungMode) {
      if (!speditionId) {
        toast({ title: "Spedition wählen", variant: "destructive" });
        return;
      }
      if (!abstimmungDate) {
        toast({ title: "Datum eingeben", variant: "destructive" });
        return;
      }
      const betrag = Number(abstimmungBetrag);
      if (isNaN(betrag)) {
        toast({ title: "Ungültiger Betrag", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        data: {
          speditionId: parseInt(speditionId),
          movementType: "abstimmung" as any,
          movementDate: abstimmungDate,
          amount: betrag,
          bemerkungen: bemerkungen || undefined,
        }
      });
      return;
    }
    if (isAbschreibungMode) {
      if (!speditionId) {
        toast({ title: "Spedition wählen", variant: "destructive" });
        return;
      }
      if (!abschreibungDate) {
        toast({ title: "Datum eingeben", variant: "destructive" });
        return;
      }
      const betrag = Number(abschreibungBetrag);
      if (isNaN(betrag)) {
        toast({ title: "Ungültiger Betrag", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        data: {
          speditionId: parseInt(speditionId),
          movementType: "abschreibung" as any,
          movementDate: abschreibungDate,
          amount: betrag,
          bemerkungen: bemerkungen || undefined,
        }
      });
      return;
    }
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

  // For neutral with factor: amount reflects the factor-adjusted balance impact
  // e.g. VON 300 (all defect) / factor 3 = 100 effective, AN 100 → diff = 0
  const absAmount = (movementType === "neutral" && selectedFaktor > 1)
    ? Math.abs(anGross * selectedFaktor - vonGross)
    : Math.abs(calculatedAmount);

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

            {/* Special mode toggles */}
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer select-none transition-colors ${isAnfangsbestandMode ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
                onClick={() => setSpecialMode(v => v === "anfangsbestand" ? null : "anfangsbestand")}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isAnfangsbestandMode ? "border-violet-600 bg-violet-600" : "border-slate-400"}`}>
                  {isAnfangsbestandMode && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <div>
                  <div className={`text-xs font-medium leading-tight ${isAnfangsbestandMode ? "text-violet-800" : "text-slate-700"}`}>Anfangsbestand</div>
                  <div className="text-xs text-slate-400 leading-tight">01.01. Startposition</div>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer select-none transition-colors ${isAbstimmungMode ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
                onClick={() => setSpecialMode(v => v === "abstimmung" ? null : "abstimmung")}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isAbstimmungMode ? "border-slate-600 bg-slate-600" : "border-slate-400"}`}>
                  {isAbstimmungMode && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <div>
                  <div className={`text-xs font-medium leading-tight ${isAbstimmungMode ? "text-slate-800" : "text-slate-700"}`}>Ext. Abstimmung</div>
                  <div className="text-xs text-slate-400 leading-tight">E-Mail / Telefonat</div>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer select-none transition-colors ${isAbschreibungMode ? "border-pink-300 bg-pink-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}
                onClick={() => setSpecialMode(v => v === "abschreibung" ? null : "abschreibung")}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isAbschreibungMode ? "border-pink-600 bg-pink-600" : "border-slate-400"}`}>
                  {isAbschreibungMode && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <div>
                  <div className={`text-xs font-medium leading-tight ${isAbschreibungMode ? "text-pink-800" : "text-slate-700"}`}>Abschreibung</div>
                  <div className="text-xs text-slate-400 leading-tight">Verlust / Abgang</div>
                </div>
              </div>
            </div>

            {/* Anfangsbestand fields */}
            {isAnfangsbestandMode && (
              <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-violet-700">Jahr</Label>
                    <Select value={String(anfangsbestandYear)} onValueChange={v => setAnfangsbestandYear(Number(v))}>
                      <SelectTrigger className="h-9 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-violet-700">Stichtag</Label>
                    <div className="flex items-center h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500">
                      01.01.{anfangsbestandYear}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-violet-700">
                    Betrag <span className="font-normal text-slate-400">(positiv = Spedition schuldet COMET · negativ = COMET schuldet Spedition)</span>
                  </Label>
                  <Input
                    type="number"
                    className="bg-white"
                    value={anfangsbestandBetrag}
                    onChange={e => setAnfangsbestandBetrag(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="z.B. 50 oder -30"
                  />
                </div>
              </div>
            )}

            {/* Abschreibung fields */}
            {isAbschreibungMode && (
              <div className="rounded-md border border-pink-200 bg-pink-50 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-pink-700">Datum</Label>
                    <Input
                      type="date"
                      className="bg-white"
                      value={abschreibungDate}
                      onChange={e => setAbschreibungDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-pink-700">Betrag</Label>
                    <Input
                      type="number"
                      className="bg-white"
                      value={abschreibungBetrag}
                      onChange={e => setAbschreibungBetrag(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="z.B. −68 oder +12"
                    />
                  </div>
                </div>
                <p className="text-xs text-pink-700">
                  Verändert nur den Speditions-Saldo, <strong>nicht</strong> den Palettenbestand am Werk.
                  Negativ = Saldo sinkt (Paletten abschreiben) · Positiv = Saldo steigt.
                </p>
              </div>
            )}

            {/* Externe Abstimmung fields */}
            {isAbstimmungMode && (
              <div className="rounded-md border border-slate-300 bg-slate-50 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-700">Datum der Abstimmung</Label>
                    <Input
                      type="date"
                      className="bg-white"
                      value={abstimmungDate}
                      onChange={e => setAbstimmungDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-700">
                      Korrektur-Betrag
                    </Label>
                    <Input
                      type="number"
                      className="bg-white"
                      value={abstimmungBetrag}
                      onChange={e => setAbstimmungBetrag(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="z.B. +12 oder -5"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Positiv = Saldo steigt (Spedition schuldet COMET mehr) · Negativ = Saldo sinkt
                </p>
              </div>
            )}

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

            {!specialMode && <>
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
                      Von: {vonGross}{palletForm.vonDefektePaletten > 0 ? ` (${palletForm.vonDefektePaletten} defekt)` : ""} | An: {anGross}{palletForm.anDefektePaletten > 0 ? ` (${palletForm.anDefektePaletten} defekt)` : ""}
                    </div>
                    {(vonGross > 0 || anGross > 0) && (
                      <div className={`text-xs font-medium mt-1 ${isAbgang ? "text-red-600" : isZugang ? "text-green-600" : "text-blue-600"}`}>
                        {isNeutral
                          ? selectedFaktor > 1
                            ? `An COMET × ${selectedFaktor} − Von COMET = ${anGross * selectedFaktor - vonGross} → Saldo`
                            : calculatedAmount > 0
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
                    {isNeutral && selectedFaktor > 1 ? Math.abs(anGross * selectedFaktor - vonGross) : absAmount}
                  </div>
                </div>
              </div>
            </>}


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
