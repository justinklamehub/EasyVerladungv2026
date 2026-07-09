import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Route } from "lucide-react";

interface Relation {
  id: number;
  speditionId: number;
  name: string;
  kuerzel: string | null;
  ort: string | null;
  createdAt: string;
}

interface Props {
  speditionId: number;
}

export function getRelationenQueryKey(speditionId: number) {
  return ["spedition-relationen", speditionId];
}

export function RelationenTab({ speditionId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKuerzel, setNewKuerzel] = useState("");
  const [newOrt, setNewOrt] = useState("");

  const { data: relationen, isLoading } = useQuery<Relation[]>({
    queryKey: getRelationenQueryKey(speditionId),
    queryFn: () => customFetch(`/api/speditionen/${speditionId}/relationen`),
    enabled: !!speditionId,
  });

  const addMutation = useMutation({
    mutationFn: ({ kuerzel, ort }: { kuerzel: string; ort: string }) =>
      customFetch(`/api/speditionen/${speditionId}/relationen`, {
        method: "POST",
        body: JSON.stringify({ kuerzel, ort }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getRelationenQueryKey(speditionId) });
      toast({ title: "Relation hinzugefügt" });
      setNewKuerzel("");
      setNewOrt("");
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/speditionen/${speditionId}/relationen/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getRelationenQueryKey(speditionId) });
      toast({ title: "Relation entfernt" });
    },
    onError: () => toast({ title: "Fehler beim Entfernen", variant: "destructive" }),
  });

  const handleAdd = () => {
    const k = newKuerzel.trim();
    const o = newOrt.trim();
    if (!k || !o) return;
    addMutation.mutate({ kuerzel: k, ort: o });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : !relationen || relationen.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-slate-400 gap-2">
          <Route className="w-7 h-7 opacity-40" />
          <p className="text-sm">Noch keine Relationen definiert.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {relationen.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-200 rounded px-1.5 py-0.5 shrink-0">
                  {r.kuerzel ?? r.name.split(" - ")[0]}
                </span>
                <span className="text-sm text-slate-700 truncate">
                  {r.ort ?? r.name.split(" - ").slice(1).join(" - ")}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => deleteMutation.mutate(r.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 space-y-2">
        <p className="text-xs font-medium text-slate-500">Neue Relation</p>
        <div className="flex gap-2">
          <div className="w-24 space-y-1 shrink-0">
            <Label className="text-xs text-slate-400">Kürzel</Label>
            <Input
              value={newKuerzel}
              onChange={(e) => setNewKuerzel(e.target.value.toUpperCase())}
              placeholder="AGB"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="h-9 font-mono uppercase"
              maxLength={10}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-slate-400">Ort</Label>
            <Input
              value={newOrt}
              onChange={(e) => setNewOrt(e.target.value.toUpperCase())}
              placeholder="GRABEN"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="h-9 uppercase"
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              className="h-9 gap-1"
              onClick={handleAdd}
              disabled={!newKuerzel.trim() || !newOrt.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Hinzufügen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
