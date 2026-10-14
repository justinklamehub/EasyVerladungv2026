import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreatePalletPurchase, useUpdatePalletPurchase, useDeletePalletPurchase,
  getListPalletPurchasesQueryKey, type PalletPurchase,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const errorText = (e: any) => e?.data?.error ?? e?.message ?? "Fehler beim Speichern.";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateText = (s: string) => s.split("-").reverse().join(".");
const count = (n: number) => new Intl.NumberFormat("de-DE").format(n);
export function PurchaseDialog({ purchase, onClose, onSaved, embedded = false, onBusyChange }: { purchase: PalletPurchase | null; onClose: () => void; onSaved: () => void; embedded?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const create = useCreatePalletPurchase(), update = useUpdatePalletPurchase(), { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(purchase?.purchaseDate ?? today()), [amount, setAmount] = useState(String(purchase?.amount ?? ""));
  const [vendor, setVendor] = useState(purchase?.speditionName ?? ""), [reference, setReference] = useState(purchase?.reference ?? ""), [note, setNote] = useState(purchase?.note ?? "");
  const [error, setError] = useState("");
  const busy = create.isPending || update.isPending;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const save = async () => {
    setError("");
    const n = Number(amount);
    if (!vendor.trim()) { setError("Bitte Spediteur / Lieferant eingeben."); return; }
    if (!date || date > today()) { setError("Bitte gültiges, nicht zukünftiges Kaufdatum eingeben."); return; }
    if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) { setError("Bitte eine positive ganze Palettenmenge eingeben."); return; }
    const data = { purchaseDate: date, amount: n, speditionName: vendor.trim(), reference: reference.trim(), note: note.trim() };
    try {
      if (purchase) await update.mutateAsync({ id: purchase.id, data: { ...data, expectedUpdatedAt: purchase.updatedAt } });
      else await create.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListPalletPurchasesQueryKey() });
      onSaved(); onClose(); toast({ title: purchase ? "Kaufpaletten geändert" : "Kaufpaletten erfasst", description: "Speditionskonten bleiben unverändert." });
    } catch (e) { setError(errorText(e)); }
  };
  const form = <form onSubmit={(e) => { e.preventDefault(); if (!busy) save(); }} className="space-y-3">
      {embedded && <p className="text-sm text-slate-500">Kaufpaletten erhöhen Bestand und COMET-Eigentum. Speditionskonten bleiben unverändert.</p>}
      <div><Label htmlFor="purchase-vendor">Spediteur / Lieferant (freie Eingabe)</Label><Input id="purchase-vendor" value={vendor} maxLength={200} onChange={(e) => setVendor(e.target.value)} autoFocus data-testid="input-purchase-vendor" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="purchase-date">Kaufdatum / Zugang</Label><Input id="purchase-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-purchase-date" /></div>
        <div><Label htmlFor="purchase-amount">Anzahl Paletten</Label><Input id="purchase-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-purchase-amount" /></div>
      </div>
      <div><Label htmlFor="purchase-reference">Beleg / Referenz (optional)</Label><Input id="purchase-reference" value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} /></div>
      <div><Label htmlFor="purchase-note">Bemerkung (optional)</Label><Textarea id="purchase-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={busy} data-testid="button-save-purchase">Speichern</Button></DialogFooter>
    </form>;
  if (embedded) return form;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>{purchase ? "Kaufpaletten bearbeiten" : "Kaufpaletten erfassen"}</DialogTitle>
      <DialogDescription>Nur Bestand und Eigentum – keine Belastung oder Gutschrift auf einem Palettenkonto.</DialogDescription></DialogHeader>
    {form}
  </DialogContent></Dialog>;
}

export function PurchaseDetails({ purchase, canEdit, canDelete, onClose, onChanged }: {
  purchase: PalletPurchase; canEdit: boolean; canDelete: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [error, setError] = useState("");
  const remove = useDeletePalletPurchase(), queryClient = useQueryClient();
  const erase = async () => {
    setError("");
    try {
      await remove.mutateAsync({ id: purchase.id, data: { expectedUpdatedAt: purchase.updatedAt } });
      queryClient.invalidateQueries({ queryKey: getListPalletPurchasesQueryKey() });
      onChanged(); onClose();
    } catch (e) { setError(errorText(e)); }
  };
  if (editing) return <PurchaseDialog purchase={purchase} onClose={onClose} onSaved={onChanged} />;
  return <Dialog open onOpenChange={(open) => { if (!open && !remove.isPending) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Kaufpaletten</DialogTitle><DialogDescription>Eigenbestand und Eigentum – keine Kontobuchung.</DialogDescription></DialogHeader>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <dt>Datum</dt><dd>{dateText(purchase.purchaseDate)}</dd><dt>Spediteur / Lieferant</dt><dd>{purchase.speditionName}</dd>
      <dt>Anzahl</dt><dd className="font-semibold">+{count(purchase.amount)}</dd><dt>Beleg / Referenz</dt><dd>{purchase.reference || "–"}</dd>
      <dt>Bemerkung</dt><dd className="whitespace-pre-wrap">{purchase.note || "–"}</dd>
    </dl>
    {confirmDelete && <p className="text-sm text-red-700">Diesen Kauf löschen? Die Menge wird aus der Kaufhistorie entfernt und der aktuelle Bestand entsprechend der letzten Inventur neu berechnet. Konten bleiben unverändert.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <DialogFooter>
      <Button variant="outline" disabled={remove.isPending} onClick={onClose}>Schließen</Button>
      {canEdit && !confirmDelete && <Button onClick={() => setEditing(true)}>Bearbeiten</Button>}
      {canDelete && <Button variant="destructive" disabled={remove.isPending} onClick={() => confirmDelete ? erase() : setConfirmDelete(true)}>{confirmDelete ? "Löschen bestätigen" : "Löschen"}</Button>}
    </DialogFooter>
  </DialogContent></Dialog>;
}
