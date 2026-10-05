import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RecordDialog, type FieldSpec } from "./record-dialog";
import { ConfirmDelete } from "./confirm-delete";
import { useRecordActions } from "../use-einlagerung";
import { errMsg, type D, type Rec } from "../lib";

export interface Column { label: string; render: (r: Rec) => React.ReactNode }

export function EntityTable({ kind, noun, records, columns, fields, defaults, searchText, canEdit, extraActions }: {
  kind: string; noun: string; records: Rec[]; columns: Column[]; fields: FieldSpec[]; defaults?: D;
  searchText: (r: Rec) => string; canEdit: boolean; extraActions?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Rec | null>(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Rec | null>(null);
  const { remove } = useRecordActions();
  const { toast } = useToast();
  const list = records.filter((r) => !q || searchText(r).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="p-3 border-b border-slate-200 flex flex-wrap gap-2 items-center">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${noun} suchen`} className="max-w-xs" data-testid={`input-search-${kind}`} />
        <span className="text-xs text-slate-500">{list.length} von {records.length}</span>
        <div className="ml-auto flex gap-2">
          {extraActions}
          {canEdit && <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }} data-testid={`button-new-${kind}`}><Plus className="w-4 h-4 mr-1" />Neu</Button>}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500" data-testid={`empty-${kind}`}>{records.length === 0 ? `Noch keine Einträge (${noun}).` : "Keine Treffer."}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="app-table">
            <TableHeader><TableRow>{columns.map((c) => <TableHead key={c.label}>{c.label}</TableHead>)}{canEdit && <TableHead />}</TableRow></TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id} data-testid={`row-${kind}-${r.id}`}>
                  {columns.map((c) => <TableCell key={c.label}>{c.render(r)}</TableCell>)}
                  {canEdit && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => { setEdit(r); setOpen(true); }} data-testid={`button-edit-${kind}-${r.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDel(r)} data-testid={`button-delete-${kind}-${r.id}`}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <RecordDialog open={open} onOpenChange={setOpen} title={edit ? `${noun} bearbeiten` : `${noun} anlegen`} kind={kind} record={edit} fields={fields} defaults={defaults} />
      <ConfirmDelete open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${noun} löschen?`} description="Der Eintrag wird dauerhaft entfernt. Verknüpfte Daten können das Löschen verhindern."
        onConfirm={async () => { if (!del) return; try { await remove(kind, del.id); toast({ title: "Gelöscht" }); } catch (e) { toast({ title: "Löschen fehlgeschlagen", description: errMsg(e), variant: "destructive" }); } setDel(null); }} />
    </div>
  );
}

export const ActiveBadge = ({ on }: { on: unknown }) => (on === false ? <Badge variant="outline">Inaktiv</Badge> : <Badge variant="secondary">Aktiv</Badge>);
