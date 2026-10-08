import { ReactNode, useState, useEffect } from "react";
import { AppSidebar } from "./sidebar";
import { ConnectionBanner } from "./connection-banner";
import { useTheme } from "@/hooks/use-theme";
import { ChatProvider } from "@/components/chat/chat-context";
import { ChatWidget } from "@/components/chat/chat-widget";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";

const STORAGE_KEY = "sidebar-collapsed";

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const { isDark, toggleTheme } = useTheme();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const compactMobileLayout = isMobile && (location.startsWith("/einlagerung") || location === "/system-status");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  // Keep the desktop preference, but give these operational pages room on handhelds.
  const effectiveCollapsed = compactMobileLayout ? !mobileExpanded : collapsed;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* */ }
  }, [collapsed]);

  return (
    <ChatProvider>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-900 w-full overflow-hidden">
        <AppSidebar
          collapsed={effectiveCollapsed}
          onToggle={() => compactMobileLayout ? setMobileExpanded((v) => !v) : setCollapsed((c) => !c)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <ConnectionBanner />
          <main className={`flex-1 overflow-auto relative ${compactMobileLayout ? "p-3" : "p-6"}`}>
            {children}
          </main>
        </div>
      </div>
      <ChatWidget />
    </ChatProvider>
  );
}
