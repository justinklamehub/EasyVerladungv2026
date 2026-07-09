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
  const [newName, setNewName] = useState("");

  const { data: relationen, isLoading } = useQuery<Relation[]>({
    queryKey: getRelationenQueryKey(speditionId),
    queryFn: () => customFetch(`/api/speditionen/${speditionId}/relationen`),
    enabled: !!speditionId,
  });

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      customFetch(`/api/speditionen/${speditionId}/relationen`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getRelationenQueryKey(speditionId) });
      toast({ title: "Relation hinzugefügt" });
      setNewName("");
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
    const trimmed = newName.trim();
    if (!trimmed) return;
    addMutation.mutate(trimmed);
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
        <div className="space-y-1.5">
          {relationen.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 bg-slate-50 group"
            >
              <span className="text-sm text-slate-700 font-medium">{r.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteMutation.mutate(r.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end pt-2 border-t border-slate-100">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Neue Relation</Label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Werk A → Lager B"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          className="h-9 gap-1"
          onClick={handleAdd}
          disabled={!newName.trim() || addMutation.isPending}
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
  );
}
