import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Brain, Plus, Pencil, Trash2, Search, Bot, Tag } from "lucide-react";

interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  active: boolean;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  "allgemein",
  "Sendungen",
  "Paletten",
  "Gefahrgut",
  "Tor / Rampe",
  "Auswertung",
  "Spediteure",
  "Technisches",
];

function EntryDialog({
  open,
  onClose,
  entry,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  entry: KnowledgeEntry | null;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const [title, setTitle] = useState(entry?.title ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [category, setCategory] = useState(entry?.category ?? "allgemein");
  const [customCat, setCustomCat] = useState(
    entry && !CATEGORIES.includes(entry.category) ? entry.category : "",
  );
  const [useCustom, setUseCustom] = useState(
    !!(entry && !CATEGORIES.includes(entry.category)),
  );

  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const cat = useCustom ? customCat.trim() || "allgemein" : category;
      if (isEdit) {
        return customFetch(`/api/chat/knowledge/${entry!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category: cat }),
        });
      } else {
        return customFetch("/api/chat/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category: cat }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-knowledge"] });
      toast.success(isEdit ? "Eintrag aktualisiert" : "Eintrag erstellt");
      onSaved();
      onClose();
    },
    onError: () => toast.error("Fehler beim Speichern"),
  });

  const canSave = title.trim() && content.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-slate-700" />
            {isEdit ? "Eintrag bearbeiten" : "Neuer Wissenseintrag"}
          </DialogTitle>
          <DialogDescription>
            Dieser Eintrag wird der KI automatisch als Kontext mitgegeben.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Titel / Frage</Label>
            <Input
              placeholder="z.B. Wie storniere ich eine Sendung?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inhalt / Antwort</Label>
            <Textarea
              placeholder="Erkläre hier die Antwort ausführlich. Die KI nutzt diesen Text direkt."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCategory(c); setUseCustom(false); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    !useCustom && category === c
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  useCustom
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                + Eigene
              </button>
            </div>
            {useCustom && (
              <Input
                placeholder="Kategoriename eingeben…"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value)}
                className="mt-2"
                autoFocus
              />
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              className="flex-1 bg-slate-900 hover:bg-slate-700"
              onClick={() => mutation.mutate()}
              disabled={!canSave || mutation.isPending}
            >
              {mutation.isPending ? "Speichern…" : isEdit ? "Aktualisieren" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChatWissensbasePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editEntry, setEditEntry] = useState<KnowledgeEntry | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ entries: KnowledgeEntry[] }>({
    queryKey: ["chat-knowledge"],
    queryFn: () => customFetch("/api/chat/knowledge"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      customFetch(`/api/chat/knowledge/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-knowledge"] }),
    onError: () => toast.error("Fehler beim Aktualisieren"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/chat/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-knowledge"] });
      toast.success("Eintrag gelöscht");
      setDeleteId(null);
    },
    onError: () => toast.error("Fehler beim Löschen"),
  });

  const entries = data?.entries ?? [];
  const filtered = entries.filter(
    (e) =>
      !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase()),
  );

  const activeCount = entries.filter((e) => e.active).length;

  const byCategory = filtered.reduce<Record<string, KnowledgeEntry[]>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-100">
            <Brain className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">KI-Wissensdatenbank</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {activeCount} aktive Einträge · werden der KI automatisch mitgegeben
            </p>
          </div>
        </div>
        <Button
          className="bg-slate-900 hover:bg-slate-700 gap-2"
          onClick={() => { setEditEntry(null); setShowDialog(true); }}
        >
          <Plus className="w-4 h-4" />
          Neuer Eintrag
        </Button>
      </div>

      {/* AI info banner */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
        <Bot className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          <p className="font-medium text-blue-900">So funktioniert das Lernen</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Alle <strong>aktiven</strong> Einträge werden bei jeder KI-Anfrage in den System-Prompt injiziert. 
            Je mehr gute Einträge du pflegst, desto besser kann die KI spezifische COMET-Fragen beantworten.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Einträge durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Laden…</div>
      ) : Object.keys(byCategory).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Brain className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-medium">
            {search ? "Keine Einträge gefunden." : "Noch keine Einträge vorhanden."}
          </p>
          {!search && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditEntry(null); setShowDialog(true); }}
            >
              Ersten Eintrag erstellen
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCategory).map(([cat, catEntries]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat}</span>
                <span className="text-xs text-slate-400">({catEntries.length})</span>
              </div>
              <div className="space-y-2">
                {catEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-xl border p-4 flex gap-4 transition-colors ${
                      entry.active
                        ? "bg-white border-slate-200"
                        : "bg-slate-50 border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="font-medium text-sm text-slate-900">{entry.title}</p>
                        {!entry.active && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-300">
                            Inaktiv
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">
                        {entry.content}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-2">
                        Erstellt von {entry.created_by_name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Switch
                        checked={entry.active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: entry.id, active: v })}
                        title={entry.active ? "Deaktivieren" : "Aktivieren"}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => { setEditEntry(entry); setShowDialog(true); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => setDeleteId(entry.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entry dialog */}
      <EntryDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditEntry(null); }}
        entry={editEntry}
        onSaved={() => {}}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Wissenseintrag wird dauerhaft gelöscht und steht der KI nicht mehr zur Verfügung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
