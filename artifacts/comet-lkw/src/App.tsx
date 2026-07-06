import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { toast as sonnerToast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { useSocket } from "@/hooks/use-socket";
import { usePermissions } from "@/hooks/use-permissions";
import { useCustomDesign } from "@/hooks/use-custom-design";
import NotFound from "@/pages/not-found";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

function TitleSetter() {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["settings-public"],
    queryFn: () => fetch(`${API}/settings/public`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    const title = data?.page_title || data?.app_name || "Easy-Verladung";
    document.title = title;
  }, [data]);
  useCustomDesign(data?.custom_design);
  return null;
}

import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
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
import AuswertungPage from "@/pages/auswertung";
import AuftragsauswertungPage from "@/pages/auftragsauswertung";
import ScannerLandingPage from "@/pages/scanner/index";
import ScannerGefahrgutPage from "@/pages/scanner/gefahrgut";
import GefahrgutPage from "@/pages/gefahrgut/index";
import HilfePage from "@/pages/hilfe";
import TicketsPage from "@/pages/tickets";
import KalkulationPage from "@/pages/kalkulation";
import ImpressumPage from "@/pages/impressum";
import DatenschutzPage from "@/pages/datenschutz";
import ChangelogPage from "@/pages/changelog";
import FotosPage from "@/pages/fotos/index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, roles, permission }: { component: any, roles?: string[], permission?: string }) {
  const { user, isLoading } = useAuth();
  const permissions = usePermissions();

  if (isLoading) return <div className="h-screen w-full flex items-center justify-center">Laden...</div>;
  if (!user) return <Redirect to="/login" />;

  if (roles && !roles.includes(user.role)) {
    const hasPermissionOverride = permission && !!permissions[permission];
    if (!hasPermissionOverride) {
      return <Redirect to="/dashboard" />;
    }
  }

  return <Component />;
}

function Router() {
  // Initialize socket hook at router level so it mounts once
  useSocket();

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/scanner" component={ScannerLandingPage} />
      <Route path="/scanner/gefahrgut" component={ScannerGefahrgutPage} />
      <Route path="/impressum" component={ImpressumPage} />
      <Route path="/datenschutz" component={DatenschutzPage} />

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="*">
        <AppLayout>
          <Switch>
            <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
            <Route path="/shipments/kanban"><ProtectedRoute component={KanbanPage} /></Route>
            <Route path="/shipments"><ProtectedRoute component={ShipmentsPage} /></Route>
            <Route path="/speditionen"><ProtectedRoute component={SpeditionenPage} roles={["comet_admin", "comet_leitstand"]} /></Route>
            <Route path="/users"><ProtectedRoute component={UsersPage} /></Route>
            <Route path="/paletten"><ProtectedRoute component={PalettenPage} /></Route>
            <Route path="/abstimmungen"><ProtectedRoute component={AbstimmungenPage} /></Route>
            <Route path="/auditlog"><ProtectedRoute component={AuditlogPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/speditionsfreigabe"><ProtectedRoute component={SpeditionsfreigebePage} roles={["speditions_admin"]} /></Route>
            <Route path="/settings"><ProtectedRoute component={SettingsPage} roles={["comet_admin"]} /></Route>
            <Route path="/berechtigungen"><ProtectedRoute component={BerechtigungenPage} roles={["comet_admin"]} /></Route>
            <Route path="/wochenansicht"><ProtectedRoute component={WochenansichtPage} /></Route>
            <Route path="/auswertung"><ProtectedRoute component={AuswertungPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/auftragsauswertung"><ProtectedRoute component={AuftragsauswertungPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/profil"><ProtectedRoute component={ProfilPage} /></Route>
            <Route path="/gefahrgut"><ProtectedRoute component={GefahrgutPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/fotos"><ProtectedRoute component={FotosPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} permission="foto.view" /></Route>
            <Route path="/hilfe"><ProtectedRoute component={HilfePage} /></Route>
            <Route path="/tickets"><ProtectedRoute component={TicketsPage} /></Route>
            <Route path="/kalkulation"><ProtectedRoute component={KalkulationPage} roles={["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"]} /></Route>
            <Route path="/changelog"><ProtectedRoute component={ChangelogPage} /></Route>
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
        <TitleSetter />
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
