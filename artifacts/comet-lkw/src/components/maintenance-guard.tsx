import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { getGetMaintenanceStatusQueryKey, getGetMeQueryKey, useGetMaintenanceStatus, useLogout } from "@workspace/api-client-react";
import { AlertTriangle, Loader2, LogOut, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { getSocket } from "@/lib/socket";

const PUBLIC_ROUTE = (path: string) =>
  path === "/login" || path === "/forgot-password" || path.startsWith("/reset-password") ||
  path === "/passwort-aendern" || path.startsWith("/scanner") ||
  path === "/stempeluhr-terminal" || path === "/impressum" || path === "/datenschutz";

function MaintenanceNotice({ message, statusUnavailable = false }: { message: string; statusUnavailable?: boolean }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [logoutError, setLogoutError] = useState("");

  const signOut = async () => {
    setLogoutError("");
    if (!user) {
      setLocation("/login");
      return;
    }
    try {
      await logout.mutateAsync(undefined);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/login");
    } catch {
      setLogoutError("Abmelden ist momentan nicht möglich. Bitte versuchen Sie es erneut.");
    }
  };

  return (
    <main className="min-h-[100dvh] bg-slate-50 text-slate-900 flex items-center justify-center p-5" data-testid="maintenance-page">
      <Card className="w-full max-w-xl border-slate-200 shadow-md">
        <CardContent className="p-8 sm:p-10 text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            {statusUnavailable ? <AlertTriangle className="h-7 w-7" /> : <Wrench className="h-7 w-7" />}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
              {statusUnavailable ? "Zugriff vorübergehend eingeschränkt" : "Wartungsmodus"}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Die Anwendung ist vorübergehend nicht verfügbar</h1>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{message}</p>
          <p className="text-sm text-slate-500">Bitte versuchen Sie es später erneut. Diese Seite aktualisiert sich automatisch.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {user
              ? <Button variant="outline" disabled={logout.isPending} onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Abmelden</Button>
              : <Button variant="outline" asChild><Link href="/login">Zur Anmeldung</Link></Button>}
          </div>
          {logoutError && <p role="alert" className="text-sm text-red-700">{logoutError}</p>}
        </CardContent>
      </Card>
    </main>
  );
}

export function MaintenanceGuard({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const publicRoute = PUBLIC_ROUTE(location);
  const statusQuery = useGetMaintenanceStatus({
    query: {
      queryKey: getGetMaintenanceStatusQueryKey(),
      enabled: !publicRoute && user?.role !== "comet_admin",
      retry: 1,
      refetchInterval: 5_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  });

  useEffect(() => {
    if (!user || user.role === "comet_admin") return;
    const socket = getSocket();
    const update = (status: { enabled: boolean; message: string }) => {
      queryClient.setQueryData(getGetMaintenanceStatusQueryKey(), status);
    };
    socket.on("maintenance:update", update);
    return () => { socket.off("maintenance:update", update); };
  }, [user?.id, user?.role, queryClient]);

  if (publicRoute || user?.role === "comet_admin") return <>{children}</>;

  if (statusQuery.isLoading || authLoading) {
    return <main className="min-h-[100dvh] flex items-center justify-center bg-slate-50"><div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Wartungsstatus wird geprüft …</div></main>;
  }
  if (statusQuery.isError) {
    return <MaintenanceNotice message="Der Wartungsstatus konnte nicht sicher geprüft werden." statusUnavailable />;
  }
  if (statusQuery.data?.enabled) return <MaintenanceNotice message={statusQuery.data.message} />;
  return <>{children}</>;
}
