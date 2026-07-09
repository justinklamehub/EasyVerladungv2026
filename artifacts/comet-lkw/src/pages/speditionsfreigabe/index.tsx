import { useAuth } from "@/contexts/auth-context";
import {
  useListGrantedPermissions,
  useListReceivedPermissions,
  getGrantedPermissionsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, ShieldCheck, Check, BookOpen, PencilLine, Ban } from "lucide-react";
import { Redirect } from "wouter";

function levelBadge(level: string) {
  if (level === "edit") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">Bearbeiten</Badge>;
  if (level === "view") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">Lesen</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none">Ausstehend</Badge>;
}

export default function SpeditionsfreigebePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!user || user.role !== "speditions_admin") {
    return <Redirect to="/dashboard" />;
  }

  const mySpeditionId = user.speditionId!;

  const { data: granted, isLoading: loadingGranted } = useListGrantedPermissions(mySpeditionId);
  const { data: received, isLoading: loadingReceived } = useListReceivedPermissions(mySpeditionId);

  const setLevelMutation = useMutation({
    mutationFn: ({ receivingId, level }: { receivingId: number; level: "view" | "edit" | "pending" }) =>
      customFetch(`/api/speditionen/${mySpeditionId}/permissions/${receivingId}`, {
        method: "PUT",
        body: JSON.stringify({ permissionLevel: level }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGrantedPermissionsQueryKey(mySpeditionId) });
      toast({ title: "Berechtigung aktualisiert" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler", variant: "destructive" }),
  });

  const activeReceived = (received ?? []).filter(r => r.permissionLevel === "view" || r.permissionLevel === "edit");

  return (
    <div className="space-y-8 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Speditionsfreigabe</h1>
        <p className="text-sm text-slate-500 mt-1">
          COMET definiert vorab, welche Speditionen Zugang zu Ihren Verladungen erhalten dürfen.
          Sie entscheiden dann, ob diese lesen, bearbeiten oder garnicht zugreifen dürfen.
        </p>
      </div>

      {/* Erteilte Freigaben — COMET-Whitelist mit Level-Auswahl durch Speditionsadmin */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Freigaben für Partner-Speditionen</CardTitle>
          </div>
          <CardDescription>
            COMET hat folgende Speditionen für den Zugriff auf Ihre Verladungen vorgemerkt.
            Legen Sie für jeden Eintrag fest, welchen Zugang diese Spedition erhält.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingGranted ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !granted || granted.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              Keine Freigaben von COMET vorgemerkt.
            </p>
          ) : (
            <div className="space-y-2">
              {granted.map((g) => {
                const level = g.permissionLevel as string;
                const isPending = level === "pending";
                const isView = level === "view";
                const isEdit = level === "edit";
                const busy = setLevelMutation.isPending;

                return (
                  <div
                    key={g.receivingSpeditionId}
                    className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {g.receivingSpeditionName ?? `ID ${g.receivingSpeditionId}`}
                      </span>
                      {levelBadge(level)}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant={isView ? "default" : "outline"}
                        className={`h-8 gap-1 text-xs ${isView ? "" : "text-slate-600"}`}
                        disabled={busy || isView}
                        onClick={() => setLevelMutation.mutate({ receivingId: g.receivingSpeditionId, level: "view" })}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Lesen
                        {isView && <Check className="w-3 h-3 ml-0.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={isEdit ? "default" : "outline"}
                        className={`h-8 gap-1 text-xs ${isEdit ? "" : "text-slate-600"}`}
                        disabled={busy || isEdit}
                        onClick={() => setLevelMutation.mutate({ receivingId: g.receivingSpeditionId, level: "edit" })}
                      >
                        <PencilLine className="w-3.5 h-3.5" />
                        Bearbeiten
                        {isEdit && <Check className="w-3 h-3 ml-0.5" />}
                      </Button>
                      {!isPending && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                          disabled={busy}
                          onClick={() => setLevelMutation.mutate({ receivingId: g.receivingSpeditionId, level: "pending" })}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Garnicht
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meine Zugriffsrechte — was andere dieser Spedition erteilt haben */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-500" />
            <CardTitle className="text-base">Meine Zugriffsrechte</CardTitle>
          </div>
          <CardDescription>
            Diese Speditionen haben Ihnen Zugriff auf ihre Verladungen erteilt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReceived ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : activeReceived.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Sie haben derzeit Zugriff auf keine weiteren Speditionen.</p>
          ) : (
            <div className="space-y-2">
              {activeReceived.map((r) => (
                <div key={r.grantingSpeditionId} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">
                    {r.grantingSpeditionName ?? `ID ${r.grantingSpeditionId}`}
                  </span>
                  {levelBadge(r.permissionLevel)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
