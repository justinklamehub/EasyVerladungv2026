import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  useListGrantedPermissions,
  useListReceivedPermissions,
  useAddSpeditionPermission,
  useDeleteSpeditionPermission,
  useListSpeditionen,
  getGrantedPermissionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, Eye, ShieldCheck } from "lucide-react";
import { Redirect } from "wouter";

function permBadge(level: string) {
  if (level === "edit") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">Lesen & Schreiben</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">Nur lesen</Badge>;
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
  const { data: allSpeditionen } = useListSpeditionen();

  const [newReceiverId, setNewReceiverId] = useState("");
  const [newLevel] = useState<"read">("read");

  const addMutation = useAddSpeditionPermission(mySpeditionId, {
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGrantedPermissionsQueryKey(mySpeditionId) });
        toast({ title: "Freigabe erteilt" });
        setNewReceiverId("");
      },
      onError: (e: any) => toast({ title: e?.message ?? "Fehler beim Hinzufügen", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteSpeditionPermission(mySpeditionId, {
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGrantedPermissionsQueryKey(mySpeditionId) });
        toast({ title: "Freigabe widerrufen" });
      },
      onError: () => toast({ title: "Fehler beim Widerrufen", variant: "destructive" }),
    },
  });

  const grantedIds = new Set((granted ?? []).map((g) => g.receivingSpeditionId));
  const availableSpeditionen = (allSpeditionen ?? []).filter(
    (s) => s.id !== mySpeditionId && !grantedIds.has(s.id),
  );

  const handleAdd = () => {
    if (!newReceiverId) {
      toast({ title: "Bitte eine Spedition auswählen", variant: "destructive" });
      return;
    }
    addMutation.mutate({ receivingSpeditionId: parseInt(newReceiverId), permissionLevel: newLevel });
  };

  return (
    <div className="space-y-8 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Speditionsfreigabe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Verwalten Sie, welche Partner-Speditionen Ihre Verladungen einsehen dürfen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Erteilte Freigaben</CardTitle>
          </div>
          <CardDescription>
            Diese Speditionen haben Lesezugriff auf Ihre Verladungen. Palettenkonto und Abstimmungen sind davon nicht betroffen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Spedition hinzufügen</label>
              <Select value={newReceiverId} onValueChange={setNewReceiverId}>
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Spedition wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSpeditionen.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">Keine weiteren Speditionen verfügbar</div>
                  ) : (
                    availableSpeditionen.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newReceiverId || addMutation.isPending}
              className="h-9"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Freigeben</>}
            </Button>
          </div>

          <Separator />

          {loadingGranted ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !granted || granted.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Noch keine Freigaben erteilt.</p>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Spedition</TableHead>
                  <TableHead>Berechtigung</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {granted.map((g) => (
                  <TableRow key={g.receivingSpeditionId}>
                    <TableCell className="font-medium">{g.receivingSpeditionName ?? `ID ${g.receivingSpeditionId}`}</TableCell>
                    <TableCell>{permBadge(g.permissionLevel)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteMutation.mutate(g.receivingSpeditionId)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Widerrufen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-500" />
            <CardTitle className="text-base">Meine Zugriffsrechte</CardTitle>
          </div>
          <CardDescription>
            Diese Speditionen haben Ihnen Zugriff auf ihre Verladungen erteilt. Dieser Zugriff gilt ausschließlich für Verladungen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReceived ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !received || received.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Sie haben derzeit Zugriff auf keine weiteren Speditionen.</p>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Spedition</TableHead>
                  <TableHead>Berechtigung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.map((r) => (
                  <TableRow key={r.grantingSpeditionId}>
                    <TableCell className="font-medium">{r.grantingSpeditionName ?? `ID ${r.grantingSpeditionId}`}</TableCell>
                    <TableCell>{permBadge(r.permissionLevel)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
