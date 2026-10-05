import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SimpleSelect } from "./simple-select";
import { useRecordActions } from "../use-einlagerung";
import { errMsg, type D, type Rec } from "../lib";

export interface FieldSpec {
  key: string; label: string;
  type: "text" | "number" | "bool" | "select" | "color" | "textarea" | "date";
  options?: { value: string; label: string }[];
  numeric?: boolean; nullable?: boolean; required?: boolean; hint?: string;
}

const NONE = "__none";

export function RecordDialog({ open, onOpenChange, title, kind, record, fields, defaults }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; kind: string;
  record: Rec | null; fields: FieldSpec[]; defaults?: D;
}) {
  const [v, setV] = useState<Record<string, any>>({});
  const { save, busy } = useRecordActions();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const src: D = { ...(defaults ?? {}), ...(record?.d ?? {}) };
    const init: Record<string, any> = {};
    for (const f of fields) {
      const x = src[f.key];
      if (f.type === "bool") init[f.key] = x === undefined ? true : !!x;
      else init[f.key] = x === null || x === undefined ? "" : String(x);
    }
    setV(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const out: D = { ...(record?.d ?? {}), ...(defaults && !record ? defaults : {}) };
    for (const f of fields) {
      const raw = v[f.key];
      if (f.type === "bool") { out[f.key] = !!raw; continue; }
      const s = String(raw ?? "").trim();
      if (f.required && !s) { toast({ title: `${f.label} fehlt`, variant: "destructive" }); return; }
      if (f.type === "number" || (f.type === "select" && f.numeric)) {
        if (!s) { out[f.key] = f.nullable ? null : 0; continue; }
        const n = Number(s);
        if (Number.isNaN(n)) { toast({ title: `${f.label} ist keine Zahl`, variant: "destructive" }); return; }
        out[f.key] = n;
      } else if (!s && f.nullable) out[f.key] = null;
      else out[f.key] = s;
    }
    try {
      await save(kind, record, out);
      toast({ title: record ? "Änderung gespeichert" : "Eintrag angelegt" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Speichern fehlgeschlagen", description: errMsg(err) + " Falls der Eintrag zwischenzeitlich geändert wurde, bitte neu laden.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === "bool" ? (
                <div className="flex items-center justify-between">
                  <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                  <Switch id={`f-${f.key}`} checked={!!v[f.key]} onCheckedChange={(c) => setV((p) => ({ ...p, [f.key]: c }))} data-testid={`switch-${f.key}`} />
                </div>
              ) : (
                <>
                  <Label htmlFor={`f-${f.key}`}>{f.label}{f.required && " *"}</Label>
                  {f.type === "select" ? (
                    <SimpleSelect
                      value={v[f.key] === "" && f.nullable ? NONE : (v[f.key] ?? "")}
                      onChange={(x) => setV((p) => ({ ...p, [f.key]: x === NONE ? "" : x }))}
                      options={[...(f.nullable ? [{ value: NONE, label: "Keine" }] : []), ...(f.options ?? [])]}
                      placeholder="Auswählen" testId={`select-${f.key}`}
                    />
                  ) : f.type === "textarea" ? (
                    <Textarea id={`f-${f.key}`} value={v[f.key] ?? ""} rows={3} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))} data-testid={`input-${f.key}`} />
                  ) : f.type === "color" ? (
                    <div className="flex gap-2">
                      <input type="color" className="h-9 w-12 rounded border border-input bg-transparent p-1" value={/^#[0-9a-f]{6}$/i.test(v[f.key] ?? "") ? v[f.key] : "#64748b"} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))} />
                      <Input value={v[f.key] ?? ""} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))} placeholder="#64748b" data-testid={`input-${f.key}`} />
                    </div>
                  ) : (
                    <Input id={`f-${f.key}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={v[f.key] ?? ""} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))} data-testid={`input-${f.key}`} />
                  )}
                  {f.hint && <p className="text-xs text-slate-500">{f.hint}</p>}
                </>
              )}
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={busy} data-testid="button-save-record">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
