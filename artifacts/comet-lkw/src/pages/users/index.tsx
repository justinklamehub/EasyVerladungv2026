import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListUsers } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Loader2, Plus, UserCog, BellRing, LogOut } from "lucide-react";
import { UserDialog } from "./components/user-dialog";
import { useAuth } from "@/contexts/auth-context";
import { usePresence } from "@/hooks/use-presence";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface PushOverviewEntry { user_id: number; count: number; username: string }

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useListUsers();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [logoutTarget, setLogoutTarget] = useState<{ id: number; username: string } | null>(null);
  const { toast } = useToast();

  const canManage = currentUser?.role === "comet_admin" || currentUser?.role === "speditions_admin";
  const isAdmin = currentUser?.role === "comet_admin";

  const { onlineUsers } = usePresence(currentUser?.id);
  const onlineIds = new Set(onlineUsers.map((u) => u.userId));

  const { data: pushOverview } = useQuery<PushOverviewEntry[]>({
    queryKey: ["push-subscriptions-overview"],
    queryFn: () => fetch(`${API}/push/subscriptions-overview`, { credentials: "include" }).then((r) => r.json()),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const pushMap = new Map((pushOverview ?? []).map((e) => [e.user_id, e.count]));

  const forceLogoutMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/users/${id}/force-logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Fehler beim Abmelden");
      }
      return res.json();
    },
    onSuccess: (_data, id) => {
      const username = users?.find((u) => u.id === id)?.username;
      toast({ title: `${username ?? "Benutzer"} wurde abgemeldet` });
      setLogoutTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
      setLogoutTarget(null);
    },
  });

  const getRoleBadge = (role: string) => {
    if (role.startsWith("comet_")) {
      return <Badge className="bg-primary/10 text-primary border-none hover:bg-primary/20 text-xs">{role.replace("comet_", "")}</Badge>;
    }
    return <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-none text-xs">{role.replace("speditions_", "")}</Badge>;
  };

  const colCount = isAdmin ? (canManage ? 7 : 6) : (canManage ? 6 : 5);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Benutzer</h1>
          <p className="text-sm text-slate-500">Verwalten Sie Systemzugänge und Rollen.</p>
        </div>
        {canManage && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neuer Benutzer
          </Button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Benutzername</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Spedition</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && (
                <TableHead className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-default">
                          <BellRing className="w-3.5 h-3.5" />
                          Push
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Push-Benachrichtigungen aktiviert</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              )}
              {canManage && <TableHead className="text-right">Aktionen</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : !users || users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center py-8 text-slate-500">
                  Keine Benutzer gefunden.
                </TableCell>
              </TableRow>
            ) : (
              <TooltipProvider>
                {users.map((user) => {
                  const pushCount = pushMap.get(user.id) ?? 0;
                  return (
                    <TableRow key={user.id} className={!user.isActive ? "opacity-50" : ""}>
                      <TableCell className="font-medium text-slate-900">{user.username}</TableCell>
                      <TableCell className="text-slate-600 text-sm">{user.email || "—"}</TableCell>
                      <TableCell className="text-slate-700 font-medium text-sm">{user.speditionName || "COMET Intern"}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">Aktiv</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">Inaktiv</Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          {pushCount > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-center gap-1 text-primary cursor-default">
                                  <BellRing className="w-3.5 h-3.5" />
                                  <span className="text-xs font-medium">{pushCount}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {pushCount} Gerät{pushCount !== 1 ? "e" : ""} mit Push aktiviert
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && onlineIds.has(user.id) && user.id !== currentUser?.id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setLogoutTarget({ id: user.id, username: user.username })}
                                    title="Abmelden"
                                  >
                                    <LogOut className="w-4 h-4 text-slate-500 hover:text-red-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Benutzer ist online – jetzt abmelden</TooltipContent>
                              </Tooltip>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditUser(user)}
                              title="Bearbeiten"
                            >
                              <UserCog className="w-4 h-4 text-slate-500" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TooltipProvider>
            )}
          </TableBody>
        </Table>
      </div>

      <UserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <UserDialog
        open={!!editUser}
        onOpenChange={(v) => { if (!v) setEditUser(null); }}
        editUser={editUser}
      />

      <AlertDialog open={!!logoutTarget} onOpenChange={(v) => { if (!v) setLogoutTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer abmelden?</AlertDialogTitle>
            <AlertDialogDescription>
              {logoutTarget?.username} wird sofort von allen Geräten abgemeldet und muss sich erneut anmelden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forceLogoutMutation.isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => logoutTarget && forceLogoutMutation.mutate(logoutTarget.id)}
              disabled={forceLogoutMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {forceLogoutMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Abmelden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
