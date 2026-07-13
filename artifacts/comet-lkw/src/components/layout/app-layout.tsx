import { ReactNode, useState, useEffect } from "react";
import { AppSidebar } from "./sidebar";
import { ConnectionBanner } from "./connection-banner";
import { useTheme } from "@/hooks/use-theme";
import { ChatProvider } from "@/components/chat/chat-context";
import { ChatWidget } from "@/components/chat/chat-widget";

const STORAGE_KEY = "sidebar-collapsed";

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* */ }
  }, [collapsed]);

  return (
    <ChatProvider>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-900 w-full overflow-hidden">
        <AppSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <ConnectionBanner />
          <main className="flex-1 overflow-auto p-6 relative">
            {children}
          </main>
        </div>
      </div>
      <ChatWidget />
    </ChatProvider>
  );
}
