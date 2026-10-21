import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useListWarehousePickupPlans, getListWarehousePickupPlansQueryKey } from "@workspace/api-client-react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { pickupClipboardText, shipmentPickupNumbers, writePickupClipboard } from "./pickup-clipboard";

export function PickupShipmentSummary({ shipmentId }: { shipmentId: number }) {
  const q = useListWarehousePickupPlans({ query: { queryKey: getListWarehousePickupPlansQueryKey(), refetchInterval: 30000, refetchIntervalInBackground: false } });
  const numbers = shipmentPickupNumbers(q.data ?? [], shipmentId);
  const [copying, setCopying] = useState(false);
  const [manualText, setManualText] = useState("");
  const manual = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  useEffect(() => { if (manualText) { manual.current?.focus(); manual.current?.select(); } }, [manualText]);
  const copy = async (values: string[]) => {
    const text = pickupClipboardText(values);
    setCopying(true);
    try {
      await writePickupClipboard(text, navigator.clipboard);
      setManualText("");
      toast({ title: values.length === 1 ? "Liefernummer kopiert" : `${values.length} Liefernummern kopiert`, description: "Eine Liefernummer pro Zeile – direkt in Excel einfügbar." });
    } catch {
      setManualText(text);
      toast({ title: "Automatisches Kopieren nicht möglich", description: "Bitte die markierte Textliste mit Strg+C oder über das Kopiermenü kopieren.", variant: "destructive" });
    } finally { setCopying(false); }
  };
  return <section className="rounded-md border bg-slate-50 p-3 space-y-3" data-testid="shipment-pickup-deliveries">
    <h3 className="text-sm font-semibold">Eingeplante Lieferungen aus der Einlagerung</h3>
    <Button type="button" size="sm" variant="outline" className="max-w-full whitespace-normal h-auto min-h-9 text-left" disabled={copying || !q.isSuccess || q.isError || !numbers.length}
      onClick={() => void copy(numbers)} data-testid="button-copy-pickup-numbers"><Copy className="w-4 h-4 mr-2 shrink-0" />Alle Liefernummern kopieren{q.isSuccess && !q.isError && numbers.length > 0 ? ` (${numbers.length})` : ""}</Button>
    {q.isLoading ? <p className="text-xs">Abholplanung wird geladen …</p> : q.isError ?
      <div role="alert" className="text-xs text-red-700">Abholplanung konnte nicht geladen werden. <Button type="button" size="sm" variant="outline" onClick={() => q.refetch()}>Erneut versuchen</Button></div> :
      !numbers.length ? <p className="text-xs text-slate-500">Keine Lieferungen zugeordnet.</p> :
      <>
        <p className="text-xs text-slate-500">Eine Liefernummer pro Zeile, ohne Überschrift. Beim Einfügen in Excel entsteht eine Spalte. Anklicken öffnet die Lieferung in der Einlagerung.</p>
        <ul className="divide-y rounded-md border bg-white">{numbers.map((number) => <li key={number} className="flex min-w-0 items-center justify-between gap-2 px-3 py-1">
          <Link href={`/einlagerung/auftraege?deliveryNumber=${encodeURIComponent(number)}`} className="break-all text-sm text-blue-700 underline">{number}</Link>
          <Button type="button" size="sm" variant="ghost" disabled={copying} aria-label={`Liefernummer ${number} kopieren`} onClick={() => void copy([number])} data-testid={`button-copy-pickup-${number}`}><Copy className="w-4 h-4" /></Button>
        </li>)}</ul>
        {manualText && <div className="space-y-2" data-testid="pickup-copy-fallback">
          <label htmlFor={`pickup-copy-${shipmentId}`} className="block text-sm text-amber-800" role="alert">Automatisches Kopieren wurde nicht erlaubt. Diese Textliste markieren und manuell kopieren (Strg+C bzw. Kopiermenü).</label>
          <Textarea id={`pickup-copy-${shipmentId}`} ref={manual} readOnly value={manualText} rows={Math.min(8, Math.max(2, manualText.split("\n").length))}
            onFocus={(e) => e.currentTarget.select()} className="font-mono" data-testid="textarea-pickup-copy" />
        </div>}
      </>}
  </section>;
}
