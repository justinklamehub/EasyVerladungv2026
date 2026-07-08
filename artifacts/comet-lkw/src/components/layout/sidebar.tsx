import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { usePermissions } from "@/hooks/use-permissions";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Truck,
  CalendarDays,
  Building2,
  Users,
  PackageSearch,
  FileCheck2,
  History,
  FileClock,
  LogOut,
  Share2,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Bell,
  BellRing,
  BellOff,
  X,
  CheckCheck,
  Trash2,
  Info,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  FileSpreadsheet,
  Sun,
  Moon,
  ShieldAlert,
  Radio,
  HelpCircle,
  TicketIcon,
  LayoutGrid,
  Calculator,
  ChevronRight,
  Folder,
  Send,
  ImageIcon,
  type LucideProps,
} from "lucide-react";
import { NAV_ICONS } from "@/lib/nav-icons";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePresence, getPageName, ROLE_LABELS, type OnlineUser } from "@/hooks/use-presence";
import { useToast } from "@/hooks/use-toast";
import { useLocation as useWouterLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { SendPushDialog } from "@/components/layout/send-push-dialog";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const ROLES_WITH_FULL_ACCESS = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const ROLES_WITH_SPEDITION_ACCESS = ["comet_admin", "comet_leitstand"];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

function UserAvatar({ username, size = "sm" }: { username: string; size?: "sm" | "md" }) {
  const initials = username.substring(0, 2).toUpperCase();
  const colors = [
    "bg-blue-600", "bg-emerald-600", "bg-violet-600", "bg-amber-600",
    "bg-rose-600", "bg-cyan-600", "bg-orange-600", "bg-teal-600",
  ];
  const color = colors[username.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs";
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold text-white shrink-0", sz, color)}>
      {initials}
    </div>
  );
}

function OnlinePanel({ users, currentUserId }: { users: OnlineUser[]; currentUserId: number }) {
  const others = users.filter((u) => u.userId !== currentUserId);
  const me = users.find((u) => u.userId === currentUserId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">Wer ist online?</span>
          <span className="text-xs bg-emerald-600 text-white rounded-full px-1.5 py-0.5 font-medium">
            {users.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 py-12">
            <Radio className="w-8 h-8 opacity-30" />
            <p className="text-xs">Niemand online</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {/* Current user first */}
            {me && (
              <div className="px-4 py-3 bg-slate-800/20">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <UserAvatar username={me.username} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-400 truncate">
                      {me.username} <span className="text-slate-500 font-normal">(Du)</span>
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{getPageName(me.page)}</p>
                  </div>
                  <span className="text-[9px] bg-slate-800 text-slate-400 rounded px-1 py-0.5 shrink-0">
                    {ROLE_LABELS[me.role] ?? me.role}
                  </span>
                </div>
              </div>
            )}

            {/* Other users grouped by page */}
            {others.map((u) => (
              <div key={u.userId + u.connectedAt} className="px-4 py-3 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <UserAvatar username={u.username} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{u.username}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      📍 {getPageName(u.page)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[9px] bg-slate-800 text-slate-400 rounded px-1 py-0.5">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {formatDistanceToNow(new Date(u.connectedAt), { addSuffix: false, locale: de })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case "warning": return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case "success": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    case "error": return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    default: return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  }
}

function NotificationPanel({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onDismissAll,
  onNavigate,
}: {
  notifications: AppNotification[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: number) => void;
  onDismissAll: () => void;
  onNavigate: (path: string) => void;
}) {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <span className="text-sm font-semibold text-slate-100">Benachrichtigungen</span>
          {unread > 0 && (
            <span className="ml-2 text-xs bg-primary text-white rounded-full px-1.5 py-0.5">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onMarkAllRead}
                  className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Alle gelesen</TooltipContent>
            </Tooltip>
          )}
          {notifications.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onDismissAll}
                  className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Alle löschen</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500 py-12">
            <Bell className="w-8 h-8 opacity-30" />
            <p className="text-xs">Keine Benachrichtigungen</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group relative px-4 py-3 hover:bg-slate-800/40 transition-colors cursor-pointer",
                  !n.read && "bg-slate-800/20"
                )}
                onClick={() => {
                  if (!n.read) onMarkRead(n.id);
                  if (n.linkTo) onNavigate(n.linkTo);
                }}
              >
                {!n.read && (
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    <NotificationIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-medium leading-tight", n.read ? "text-slate-400" : "text-slate-100")}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">{n.message}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: de })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-slate-300 transition-all shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppSidebar({ collapsed, onToggle, isDark, onToggleTheme }: AppSidebarProps) {
  const { user, refetch } = useAuth();
  const permissions = usePermissions();
  const canSendCustomPush = !!permissions["push.send_custom"];
  const [location, setLocation] = useLocation();
  const [, navigate] = useWouterLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [showSendPush, setShowSendPush] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications();
  const { state: pushState, error: pushError, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const { toast } = useToast();

  useEffect(() => {
    if (pushError) {
      toast({ title: "Push-Fehler", description: pushError, variant: "destructive" });
    }
  }, [pushError, toast]);
  const { onlineUsers } = usePresence(user?.id);

  const { data: pubSettings } = useQuery<Record<string, string>>({
    queryKey: ["settings-public"],
    queryFn: async () => {
      const res = await fetch(`${API}/settings/public`);
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const appName = pubSettings?.app_name || "Easy-Verladung";

  const isCometUserForBadge = ROLES_WITH_FULL_ACCESS.includes(user?.role ?? "");
  const { data: gefahrgutBlankoCount } = useQuery({
    queryKey: ["gefahrgut-blanko-count"],
    queryFn: async () => {
      const res = await fetch(`${API}/gefahrgut-checklisten?blanko=true`, { credentials: "include" });
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data) ? data.length : 0;
    },
    enabled: isCometUserForBadge,
    refetchInterval: 60_000,
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/login");
      },
    },
  });

  if (!user) return null;

  const isCometUser = ROLES_WITH_FULL_ACCESS.includes(user.role);
  const canManageSpeditionen = ROLES_WITH_SPEDITION_ACCESS.includes(user.role);
  const canManageUsers = isCometUser ? canManageSpeditionen : user.role === "speditions_admin";

  const navigation: {
    name: string;
    href: string;
    icon: React.ComponentType<LucideProps>;
    show: boolean;
    badgeCount?: number;
  }[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Verladungen", href: "/shipments", icon: Truck, show: true },
    { name: "Kanban-Board", href: "/shipments/kanban", icon: LayoutGrid, show: user.role === "comet_admin" || !!permissions["kanban.use"] },
    { name: "Wochenplan", href: "/wochenansicht", icon: CalendarDays, show: true },
    { name: "Speditionen", href: "/speditionen", icon: Building2, show: canManageSpeditionen },
    { name: "Benutzer", href: "/users", icon: Users, show: canManageUsers },
    { name: "Palettenkonto", href: "/paletten", icon: PackageSearch, show: true },
    { name: "Abstimmungen", href: "/abstimmungen", icon: FileCheck2, show: true },
    { name: "Kalkulation", href: "/kalkulation", icon: Calculator, show: isCometUser },
    { name: "Gefahrgut", href: "/gefahrgut", icon: ShieldAlert, show: isCometUser, badgeCount: gefahrgutBlankoCount || 0 },
    { name: "Fotos", href: "/fotos", icon: ImageIcon, show: isCometUser || !!permissions["foto.view"] },
    { name: "Auswertung", href: "/auswertung", icon: BarChart2, show: isCometUser },
    { name: "Auftragsauswertung", href: "/auftragsauswertung", icon: FileSpreadsheet, show: isCometUser || !!permissions["auftrag.analyse.spedition"] },
    { name: "Änderungslog", href: "/auditlog", icon: History, show: isCometUser },
    { name: "Speditionsfreigabe", href: "/speditionsfreigabe", icon: Share2, show: user.role === "speditions_admin" },
    { name: "Einstellungen", href: "/settings", icon: Settings, show: user.role === "comet_admin" },
    { name: "Berechtigungen", href: "/berechtigungen", icon: ShieldCheck, show: user.role === "comet_admin" },
    { name: "Tickets", href: "/tickets", icon: TicketIcon, show: true },
    { name: "Neuerungen", href: "/changelog", icon: FileClock, show: true },
    { name: "Hilfe & Anleitung", href: "/hilfe", icon: HelpCircle, show: true },
  ];

  // Apply sidebar_nav_config customizations (label, icon, color, order)
  const navConfigRaw = pubSettings?.sidebar_nav_config;
  const navOverrides: Array<{ href: string; label?: string; color?: string; iconName?: string; categoryId?: string }> = (() => {
    try { return navConfigRaw ? JSON.parse(navConfigRaw) : []; }
    catch { return []; }
  })();
  const overrideMap = new Map(navOverrides.map((o, idx) => [o.href, { ...o, order: idx }]));

  const roleVisibility: Record<string, string[]> = (() => {
    try { return pubSettings?.sidebar_role_visibility ? JSON.parse(pubSettings.sidebar_role_visibility) : {}; }
    catch { return {}; }
  })();

  const customizedNavigation = navigation
    .filter((item) => {
      if (!item.show) return false;
      const allowed = roleVisibility[item.href];
      if (!allowed || allowed.length === 0) return true;
      return allowed.includes(user!.role);
    })
    .map((item, defaultIdx) => {
      const cfg = overrideMap.get(item.href);
      const NavIcon: React.ComponentType<LucideProps> =
        cfg?.iconName && NAV_ICONS[cfg.iconName] ? NAV_ICONS[cfg.iconName]! : item.icon;
      return {
        ...item,
        name: cfg?.label || item.name,
        NavIcon,
        activeColor: cfg?.color ?? null,
        categoryId: cfg?.categoryId ?? null,
        order: cfg !== undefined ? cfg.order : 99999 + defaultIdx,
      };
    })
    .sort((a, b) => a.order - b.order);

  // Parse sidebar categories
  const sidebarCategories: Array<{ id: string; name: string; iconName?: string; color?: string }> = (() => {
    try { return pubSettings?.sidebar_categories ? JSON.parse(pubSettings.sidebar_categories) : []; }
    catch { return []; }
  })();

  const uncategorizedItems = customizedNavigation.filter((item) => !item.categoryId);
  const byCategoryId = new Map<string, typeof customizedNavigation>();
  for (const item of customizedNavigation) {
    if (item.categoryId) {
      const list = byCategoryId.get(item.categoryId) ?? [];
      list.push(item);
      byCategoryId.set(item.categoryId, list);
    }
  }
  const activeCategories = sidebarCategories.filter((c) => byCategoryId.has(c.id));

  // Parse sidebar_order for unified top-level rendering
  const sidebarOrderConfig: Array<{ type: "item" | "category"; href?: string; id?: string }> = (() => {
    try { return pubSettings?.sidebar_order ? JSON.parse(pubSettings.sidebar_order) : []; }
    catch { return []; }
  })();

  // Build ordered top-level list (categories + uncategorized items mixed)
  function buildTopLevelOrder() {
    const catIdSet = new Set(activeCategories.map((c) => c.id));
    const uncatHrefSet = new Set(uncategorizedItems.map((i) => i.href));

    if (sidebarOrderConfig.length === 0) {
      // Fallback: uncategorized items then categories
      return [
        ...uncategorizedItems.map((i) => ({ type: "item" as const, href: i.href })),
        ...activeCategories.map((c) => ({ type: "category" as const, id: c.id })),
      ];
    }

    // Use configured order, append any unaccounted items/categories at end
    const result = sidebarOrderConfig.filter((e) => {
      if (e.type === "category") return e.id && catIdSet.has(e.id);
      if (e.type === "item") return e.href && uncatHrefSet.has(e.href);
      return false;
    });
    const accountedCatIds = new Set(result.filter((e) => e.type === "category").map((e) => e.id!));
    const accountedHrefs = new Set(result.filter((e) => e.type === "item").map((e) => e.href!));
    for (const cat of activeCategories) {
      if (!accountedCatIds.has(cat.id)) result.push({ type: "category", id: cat.id });
    }
    for (const item of uncategorizedItems) {
      if (!accountedHrefs.has(item.href)) result.push({ type: "item", href: item.href });
    }
    return result;
  }
  const topLevelOrder = buildTopLevelOrder();

  function toggleCategory(id: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const initials = user.username.substring(0, 2).toUpperCase();

  const otherOnlineCount = onlineUsers.filter((u) => u.userId !== user?.id).length;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="relative flex h-full">
        {/* Notification panel */}
        {showNotifications && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowNotifications(false)}
            />
            <div
              className="fixed top-0 bottom-0 z-50 w-72 bg-slate-950 border-r border-slate-800 shadow-2xl flex flex-col"
              style={{ left: collapsed ? 60 : 256 }}
            >
              <NotificationPanel
                notifications={notifications}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
                onDismiss={dismiss}
                onDismissAll={dismissAll}
                onNavigate={(path) => {
                  navigate(path);
                  setShowNotifications(false);
                }}
              />
            </div>
          </>
        )}

        {/* Online users panel */}
        {showOnline && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowOnline(false)}
            />
            <div
              className="fixed top-0 bottom-0 z-50 w-72 bg-slate-950 border-r border-slate-800 shadow-2xl flex flex-col"
              style={{ left: collapsed ? 60 : 256 }}
            >
              <OnlinePanel users={onlineUsers} currentUserId={user.id} />
            </div>
          </>
        )}

        <div
          className={cn(
            "bg-slate-950 text-slate-300 flex flex-col h-full border-r border-slate-900 transition-[width] duration-200 ease-in-out overflow-hidden",
            collapsed ? "w-[60px]" : "w-64"
          )}
        >
          {/* Header */}
          <div className="h-16 flex items-center border-b border-slate-800 bg-slate-950/50 shrink-0 px-3 gap-2">
            {collapsed ? (
              <button
                onClick={onToggle}
                className="w-full flex items-center justify-center p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Menü ausklappen"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : (
              <>
                <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold tracking-tighter shrink-0">
                  CO
                </div>
                <span className="font-semibold text-slate-100 tracking-tight truncate flex-1 min-w-0">
                  {appName}
                </span>
                <button
                  onClick={onToggle}
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                  title="Menü einklappen"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto py-2 sidebar-scroll">
            <nav className={cn("space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
              {(() => {
                function renderItem(item: (typeof customizedNavigation)[number]) {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/dashboard" &&
                      item.href !== "/shipments" &&
                      location.startsWith(item.href + "/")) ||
                    (item.href === "/shipments" &&
                      (location === "/shipments" || location.startsWith("/shipments/")));

                  const hasActiveCustomColor = isActive && !!item.activeColor;
                  const hasInactiveCustomColor = !isActive && !!item.activeColor;

                  const linkEl = (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-tour={item.href === "/hilfe" ? "help-link" : undefined}
                      className={cn(
                        "flex items-center rounded-md text-sm font-medium transition-all duration-150",
                        collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 px-3 py-2.5",
                        isActive
                          ? hasActiveCustomColor
                            ? "text-white shadow-sm"
                            : "bg-primary text-white shadow-sm dark:bg-white/15 dark:text-white dark:shadow-none"
                          : hasInactiveCustomColor
                          ? "hover:bg-slate-800"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                      )}
                      style={
                        hasActiveCustomColor
                          ? { backgroundColor: item.activeColor! }
                          : hasInactiveCustomColor
                          ? { color: item.activeColor! }
                          : undefined
                      }
                    >
                      <span className="relative shrink-0">
                        <item.NavIcon
                          className={cn(
                            "shrink-0",
                            collapsed ? "w-5 h-5" : "w-4 h-4",
                            isActive ? "text-white" : !item.activeColor ? "text-slate-500" : undefined
                          )}
                          style={hasInactiveCustomColor ? { color: item.activeColor! } : undefined}
                        />
                        {collapsed && !!item.badgeCount && item.badgeCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                            {item.badgeCount > 99 ? "99+" : item.badgeCount}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between min-w-0">
                          <span className="truncate">{item.name}</span>
                          {!!item.badgeCount && item.badgeCount > 0 && (
                            <span className="ml-2 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center leading-none">
                              {item.badgeCount > 99 ? "99+" : item.badgeCount}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  );

                  return collapsed ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {item.name}{!!item.badgeCount && item.badgeCount > 0 ? ` (${item.badgeCount})` : ""}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    linkEl
                  );
                }

                // Collapsed sidebar: flat list of all items (no category headers)
                if (collapsed) {
                  return customizedNavigation.map((item) => renderItem(item));
                }

                // Expanded sidebar: render unified topLevelOrder (items + categories interleaved)
                return (
                  <>
                    {topLevelOrder.map((entry) => {
                      if (entry.type === "item") {
                        const item = customizedNavigation.find((i) => i.href === entry.href && !i.categoryId);
                        if (!item) return null;
                        return renderItem(item);
                      }
                      if (entry.type === "category") {
                        const cat = sidebarCategories.find((c) => c.id === entry.id);
                        if (!cat || !byCategoryId.has(cat.id)) return null;
                        const catItems = byCategoryId.get(cat.id) ?? [];
                        const CatIcon = cat.iconName && NAV_ICONS[cat.iconName]
                          ? NAV_ICONS[cat.iconName]!
                          : Folder;
                        const isCatCollapsed = collapsedCategories.has(cat.id);
                        const catAccent = cat.color || "#6366f1";
                        return (
                          <div key={cat.id} className="mt-3">
                            {/* Separator above category */}
                            <div className="h-px bg-slate-800/80 mb-2 mx-0.5" />
                            <button
                              onClick={() => toggleCategory(cat.id)}
                              className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors group"
                            >
                              {/* Colored icon badge */}
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-opacity"
                                style={{ backgroundColor: `${catAccent}30` }}
                              >
                                <CatIcon
                                  className="w-3 h-3 shrink-0"
                                  style={{ color: catAccent }}
                                />
                              </div>
                              <span className="flex-1 text-left text-[10.5px] font-bold uppercase tracking-widest truncate text-slate-500 group-hover:text-slate-300 transition-colors">
                                {cat.name}
                              </span>
                              <ChevronRight
                                className={cn(
                                  "w-3 h-3 shrink-0 text-slate-600 group-hover:text-slate-400 transition-all duration-150",
                                  !isCatCollapsed && "rotate-90"
                                )}
                              />
                            </button>
                            {!isCatCollapsed && (
                              <div
                                className="mt-0.5 space-y-0.5 pl-2 ml-3.5 border-l"
                                style={{ borderColor: `${catAccent}40` }}
                              >
                                {catItems.map((item) => renderItem(item))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </>
                );
              })()}
            </nav>
          </div>

          {/* User footer */}
          <div data-tour="sidebar-footer" className={cn("border-t border-slate-800 bg-slate-900/30 shrink-0", collapsed ? "p-2" : "p-3")}>
            {/* ── Expanded footer ── */}
            {!collapsed && (
              <>
                {/* User info */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 uppercase shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{user.username}</div>
                    <div className="text-xs text-slate-500 truncate">{user.speditionName || "COMET"}</div>
                  </div>
                </div>

                {/* 2×2 tile grid */}
                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                  {/* Online tile */}
                  <button
                    onClick={() => { setShowOnline((v) => !v); setShowNotifications(false); }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-lg p-2.5 transition-colors min-h-[52px]",
                      showOnline
                        ? "bg-slate-700 text-slate-100"
                        : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )}
                  >
                    <div className="relative">
                      <Radio className="w-4 h-4" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                    </div>
                    <span className="text-[10px] leading-tight">
                      Online{otherOnlineCount > 0 ? ` (${otherOnlineCount})` : ""}
                    </span>
                  </button>

                  {/* Benachrichtigungen tile */}
                  <button
                    onClick={() => { setShowNotifications((v) => !v); setShowOnline(false); }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-lg p-2.5 transition-colors min-h-[52px]",
                      showNotifications
                        ? "bg-slate-700 text-slate-100"
                        : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )}
                  >
                    <div className="relative">
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-primary text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] leading-tight">Nachrichten</span>
                  </button>

                  {/* Theme tile */}
                  <button
                    onClick={onToggleTheme}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 p-2.5 transition-colors min-h-[52px]"
                  >
                    {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <span className="text-[10px] leading-tight">{isDark ? "Hell" : "Dunkel"}</span>
                  </button>

                  {/* Profil tile */}
                  <Link
                    href="/profil"
                    className="flex flex-col items-center justify-center gap-1 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 p-2.5 transition-colors min-h-[52px]"
                  >
                    <UserCog className="w-4 h-4" />
                    <span className="text-[10px] leading-tight">Profil</span>
                  </Link>
                </div>

                {/* Nachricht senden (konfigurierbar über Berechtigungen) — full width */}
                {canSendCustomPush && (
                  <button
                    onClick={() => setShowSendPush(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 p-2 text-xs transition-colors mb-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Nachricht senden
                  </button>
                )}

                {/* Push-Benachrichtigungen — full width */}
                {pushState !== "unsupported" && (
                  <button
                    onClick={() => pushState === "subscribed" ? pushUnsubscribe() : pushSubscribe()}
                    disabled={pushState === "loading" || pushState === "denied"}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-lg p-2 text-xs transition-colors mb-1.5",
                      pushState === "subscribed"
                        ? "bg-primary/20 text-primary hover:bg-primary/30"
                        : pushState === "denied"
                        ? "bg-slate-800/50 text-slate-600 cursor-not-allowed"
                        : "bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    )}
                  >
                    {pushState === "subscribed"
                      ? <><BellRing className="w-3.5 h-3.5" /> Push aktiv</>
                      : pushState === "denied"
                      ? <><BellOff className="w-3.5 h-3.5" /> Push gesperrt</>
                      : <><Bell className="w-3.5 h-3.5" /> Push aktivieren</>
                    }
                  </button>
                )}

                {/* Logout — full width */}
                <button
                  onClick={() => logoutMutation.mutate()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-red-900/40 hover:text-red-300 p-2 text-xs transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Abmelden
                </button>
              </>
            )}

            {/* ── Collapsed footer: 2×2 grid ── */}
            {collapsed && (
              <>
                <div className="grid grid-cols-2 gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setShowOnline((v) => !v); setShowNotifications(false); }}
                        className={cn(
                          "w-full h-9 flex items-center justify-center rounded-md transition-colors relative",
                          showOnline ? "bg-slate-700 text-slate-200" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        <Radio className="w-4.5 h-4.5" />
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Online{otherOnlineCount > 0 ? ` (${otherOnlineCount} andere)` : ""}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setShowNotifications((v) => !v); setShowOnline(false); }}
                        className={cn(
                          "w-full h-9 flex items-center justify-center rounded-md transition-colors relative",
                          showNotifications ? "bg-slate-700 text-slate-200" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        <Bell className="w-4 h-4" />
                        {unreadCount > 0 && (
                          <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 bg-primary text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Benachrichtigungen{unreadCount > 0 ? ` (${unreadCount})` : ""}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onToggleTheme}
                        className="w-full h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      >
                        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {isDark ? "Hellmodus" : "Dunkelmodus"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/profil"
                        className="w-full h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      >
                        <UserCog className="w-4 h-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">Mein Profil</TooltipContent>
                  </Tooltip>
                </div>

                {/* Nachricht senden (collapsed) */}
                {canSendCustomPush && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowSendPush(true)}
                        className="mt-1 w-full h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Nachricht senden
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Push toggle (collapsed) */}
                {pushState !== "unsupported" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => pushState === "subscribed" ? pushUnsubscribe() : pushSubscribe()}
                        disabled={pushState === "loading" || pushState === "denied"}
                        className={cn(
                          "mt-1 w-full h-9 flex items-center justify-center rounded-md transition-colors",
                          pushState === "subscribed"
                            ? "text-primary bg-primary/10 hover:bg-primary/20"
                            : pushState === "denied"
                            ? "text-slate-600 cursor-not-allowed"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        {pushState === "subscribed"
                          ? <BellRing className="w-4 h-4" />
                          : pushState === "denied"
                          ? <BellOff className="w-4 h-4" />
                          : <Bell className="w-4 h-4" />
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {pushState === "subscribed"
                        ? "Push-Benachrichtigungen aktiv (klicken zum Deaktivieren)"
                        : pushState === "denied"
                        ? "Push vom Browser gesperrt"
                        : "Push-Benachrichtigungen aktivieren"}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Logout */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => logoutMutation.mutate()}
                      className="mt-1 w-full h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-red-300 hover:bg-red-900/40 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Abmelden ({user.username})
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </div>
      {canSendCustomPush && (
        <SendPushDialog open={showSendPush} onOpenChange={setShowSendPush} />
      )}
    </TooltipProvider>
  );
}
