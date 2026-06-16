import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { toast as sonnerToast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { useSocket } from "@/hooks/use-socket";
import NotFound from "@/pages/not-found";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ShipmentsPage from "@/pages/shipments";
import KanbanPage from "@/pages/shipments/kanban";
import SpeditionenPage from "@/pages/speditionen";
import UsersPage from "@/pages/users";
import PalettenPage from "@/pages/paletten";
import AbstimmungenPage from "@/pages/abstimmungen";
import AuditlogPage from "@/pages/auditlog";
import SpeditionsfreigebePage from "@/pages/speditionsfreigabe";
import SettingsPage from "@/pages/settings";
import BerechtigungenPage from "@/pages/berechtigungen";
import WochenansichtPage from "@/pages/wochenansicht";
import ProfilPage from "@/pages/profil";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, roles }: { component: any, roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="h-screen w-full flex items-center justify-center">Laden...</div>;
  if (!user) return <Redirect to="/login" />;
  
  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  // Initialize socket hook at router level so it mounts once
  useSocket();

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/:path*">
        <AppLayout>
          <Switch>
            <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
            <Route path="/shipments"><ProtectedRoute component={ShipmentsPage} /></Route>
            <Route path="/shipments/kanban"><ProtectedRoute component={KanbanPage} /></Route>
            <Route path="/speditionen"><ProtectedRoute component={SpeditionenPage} roles={["comet_admin", "comet_leitstand"]} /></Route>
            <Route path="/users"><ProtectedRoute component={UsersPage} /></Route>
            <Route path="/paletten"><ProtectedRoute component={PalettenPage} /></Route>
            <Route path="/abstimmungen"><ProtectedRoute component={AbstimmungenPage} /></Route>
            <Route path="/auditlog"><ProtectedRoute component={AuditlogPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/speditionsfreigabe"><ProtectedRoute component={SpeditionsfreigebePage} roles={["speditions_admin"]} /></Route>
            <Route path="/settings"><ProtectedRoute component={SettingsPage} roles={["comet_admin"]} /></Route>
            <Route path="/berechtigungen"><ProtectedRoute component={BerechtigungenPage} roles={["comet_admin"]} /></Route>
            <Route path="/wochenansicht"><ProtectedRoute component={WochenansichtPage} /></Route>
            <Route path="/profil"><ProtectedRoute component={ProfilPage} /></Route>
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-sonner-toast]')) {
        sonnerToast.dismiss();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster richColors position="top-right" duration={10000} closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
