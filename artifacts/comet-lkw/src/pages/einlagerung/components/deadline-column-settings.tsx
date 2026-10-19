import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "../lib";
import { DEADLINE_COLUMNS, DEADLINE_COLUMNS_KEY, defaultDeadlineColumns, moveDeadlineColumn, parseDeadlineColumns, type DeadlineColumnConfig } from "./deadline-columns";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export function useDeadlineColumns() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ["deadline-column-preferences", user?.id];
  const query = useQuery({
    queryKey: key, enabled: !!user, staleTime: 0, refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch(`${API}/user-preferences/${DEADLINE_COLUMNS_KEY}`, { credentials: "include", cache: "no-store" });
      if (response.status === 404) return defaultDeadlineColumns();
      if (!response.ok) throw new Error("Spalteneinstellungen konnten nicht geladen werden.");
      return parseDeadlineColumns((await response.json()).value);
    },
  });
  const save = useMutation({
    mutationFn: async (draft: DeadlineColumnConfig) => {
      const value = parseDeadlineColumns(draft);
      const response = await fetch(`${API}/user-preferences/${DEADLINE_COLUMNS_KEY}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error("Spalteneinstellungen konnten nicht gespeichert werden.");
      return value;
    },
    onSuccess: (value) => { client.setQueryData(key, value); },
  });
  return { query, save };
}

export function DeadlineColumnSettings({ config, onSave, saving, disabled }: {
  config: DeadlineColumnConfig; onSave: (config: DeadlineColumnConfig) => Promise<unknown>; saving: boolean; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const submit = async () => {
    setError("");
    try {
      await onSave(parseDeadlineColumns(draft));
      setOpen(false);
      toast({ title: "Tabellenansicht gespeichert", description: "Die Spalteneinstellungen gelten für dein Benutzerkonto." });
    } catch (e) { setError(errMsg(e)); }
  };

  return <>
    <Button type="button" size="sm" variant="outline" disabled={disabled} data-testid="button-deadline-columns"
      onClick={() => { setDraft(structuredClone(config)); setError(""); setOpen(true); }}>
      <Settings2 className="h-4 w-4 mr-2" />Spalten anpassen
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Tabellenansicht anpassen</DialogTitle>
          <DialogDescription>Spalten ein- oder ausblenden und mit den Pfeilen verschieben. Die Ansicht wird für dein Benutzerkonto gespeichert. Druck und Excel-Export bleiben unverändert.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-2 pr-1">
          {draft.columns.map((column, i) => {
            const label = DEADLINE_COLUMNS.find(([id]) => id === column.id)![1];
            return <div key={column.id} className="flex items-center gap-3 rounded-md border p-2" data-testid={`deadline-column-${column.id}`}>
              <Checkbox id={`deadline-column-${column.id}`} checked={column.visible} disabled={saving}
                onCheckedChange={(checked) => setDraft({ ...draft, columns: draft.columns.map((c) => c.id === column.id ? { ...c, visible: checked === true } : c) })} />
              <label htmlFor={`deadline-column-${column.id}`} className="flex-1 text-sm cursor-pointer">{label}</label>
              <Button type="button" size="icon" variant="ghost" disabled={i === 0 || saving}
                aria-label={`${label} nach oben`} onClick={() => setDraft(moveDeadlineColumn(draft, column.id, -1))}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" disabled={i === draft.columns.length - 1 || saving}
                aria-label={`${label} nach unten`} onClick={() => setDraft(moveDeadlineColumn(draft, column.id, 1))}><ArrowDown className="h-4 w-4" /></Button>
            </div>;
          })}
          <Button type="button" size="sm" variant="outline" disabled={saving}
            onClick={() => { setDraft(defaultDeadlineColumns()); setError(""); }}>Standardansicht wiederherstellen</Button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button type="button" disabled={saving} onClick={submit} data-testid="button-save-deadline-columns">{saving ? "Speichern …" : "Ansicht speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
