import { ReactNode, useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "./sidebar";
import { ConnectionBanner } from "./connection-banner";
import { useTheme } from "@/hooks/use-theme";
import { ChatProvider } from "@/components/chat/chat-context";
import { ChatWidget } from "@/components/chat/chat-widget";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useNotifications } from "@/hooks/use-notifications";
import { usePresence } from "@/hooks/use-presence";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "sidebar-collapsed";

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  // These services stay mounted when the mobile navigation is closed.
  const notificationsController = useNotifications();
  const pushController = usePushNotifications();
  const { onlineUsers } = usePresence(user?.id);
  const { toast } = useToast();
  useEffect(() => {
    if (pushController.error) toast({ title: "Push-Fehler", description: pushController.error, variant: "destructive" });
  }, [pushController.error, toast]);
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const compactMobileLayout = isMobile && (location.startsWith("/einlagerung") || location === "/system-status");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* */ }
  }, [collapsed]);

  // Drawer schliesst nach Navigation oder beim Wechsel auf Desktop.
  useEffect(() => { setDrawerOpen(false); }, [location, isMobile]);

  const mainPadding = isMobile ? (compactMobileLayout ? "p-3" : "p-3 sm:p-4") : "p-6";

  return (
    <ChatProvider>
      <div className="flex h-[100dvh] bg-slate-50 dark:bg-slate-900 w-full overflow-hidden">
        {!isMobile && (
          <AppSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            notificationsController={notificationsController}
            pushController={pushController}
            onlineUsers={onlineUsers}
          />
        )}
        <div className="flex-1 flex flex-col min-w-0">
          {isMobile && (
            <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-white dark:bg-slate-900">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger asChild>
                  <button
                    aria-label={notificationsController.unreadCount ? `Navigation öffnen, ${notificationsController.unreadCount} ungelesene Benachrichtigungen` : "Navigation öffnen"}
                    data-testid="button-mobile-nav-open"
                    className="relative p-2 -ml-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Menu className="w-5 h-5" />
                    {notificationsController.unreadCount > 0 && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 max-w-[85vw] p-0 gap-0 border-0 bg-slate-950 [&>button]:hidden" data-testid="drawer-mobile-nav"
                  onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest("a[href]")) setDrawerOpen(false);
                  }}>
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">Hauptnavigation und Kontofunktionen</SheetDescription>
                  <AppSidebar
                    collapsed={false}
                    onToggle={() => setDrawerOpen(false)}
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                    notificationsController={notificationsController}
                    pushController={pushController}
                    onlineUsers={onlineUsers}
                  />
                </SheetContent>
              </Sheet>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">Menü</span>
            </div>
          )}
          <ConnectionBanner />
          <main className={`flex-1 overflow-auto relative ${mainPadding}`} data-testid="app-main">
            {children}
          </main>
        </div>
      </div>
      <ChatWidget />
    </ChatProvider>
  );
}
