import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
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
  LogOut,
  Share2,
  Settings,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Bell,
  X,
  CheckCheck,
  Trash2,
  Info,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Sun,
  Moon,
  ShieldAlert,
  Radio,
  HelpCircle,
  TicketIcon,
  LayoutGrid,
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
import { usePresence, getPageName, ROLE_LABELS, type OnlineUser } from "@/hooks/use-presence";
import { useLocation as useWouterLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

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

      <div className="flex-1 overflow-y-auto">
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

      <div className="flex-1 overflow-y-auto">
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
  const [location, setLocation] = useLocation();
  const [, navigate] = useWouterLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications();
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
  }[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Verladungen", href: "/shipments", icon: Truck, show: true },
    { name: "Kanban-Board", href: "/shipments/kanban", icon: LayoutGrid, show: ["comet_admin", "comet_leitstand", "comet_lager"].includes(user.role) },
    { name: "Wochenplan", href: "/wochenansicht", icon: CalendarDays, show: true },
    { name: "Speditionen", href: "/speditionen", icon: Building2, show: canManageSpeditionen },
    { name: "Benutzer", href: "/users", icon: Users, show: canManageUsers },
    { name: "Palettenkonto", href: "/paletten", icon: PackageSearch, show: true },
    { name: "Abstimmungen", href: "/abstimmungen", icon: FileCheck2, show: true },
    { name: "Gefahrgut", href: "/gefahrgut", icon: ShieldAlert, show: isCometUser },
    { name: "Auswertung", href: "/auswertung", icon: BarChart2, show: isCometUser },
    { name: "Änderungslog", href: "/auditlog", icon: History, show: isCometUser },
    { name: "Speditionsfreigabe", href: "/speditionsfreigabe", icon: Share2, show: user.role === "speditions_admin" },
    { name: "Einstellungen", href: "/settings", icon: Settings, show: user.role === "comet_admin" },
    { name: "Berechtigungen", href: "/berechtigungen", icon: ShieldCheck, show: user.role === "comet_admin" },
    { name: "Tickets", href: "/tickets", icon: TicketIcon, show: true },
    { name: "Hilfe & Anleitung", href: "/hilfe", icon: HelpCircle, show: true },
  ];

  // Apply sidebar_nav_config customizations (label, icon, color, order)
  const navConfigRaw = pubSettings?.sidebar_nav_config;
  const navOverrides: Array<{ href: string; label?: string; color?: string; iconName?: string }> = (() => {
    try { return navConfigRaw ? JSON.parse(navConfigRaw) : []; }
    catch { return []; }
  })();
  const overrideMap = new Map(navOverrides.map((o, idx) => [o.href, { ...o, order: idx }]));

  const customizedNavigation = navigation
    .filter((item) => item.show)
    .map((item, defaultIdx) => {
      const cfg = overrideMap.get(item.href);
      const NavIcon: React.ComponentType<LucideProps> =
        cfg?.iconName && NAV_ICONS[cfg.iconName] ? NAV_ICONS[cfg.iconName]! : item.icon;
      return {
        ...item,
        name: cfg?.label || item.name,
        NavIcon,
        activeColor: cfg?.color ?? null,
        order: cfg !== undefined ? cfg.order : 99999 + defaultIdx,
      };
    })
    .sort((a, b) => a.order - b.order);

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
          <div className="flex-1 overflow-y-auto py-2">
            <nav className={cn("space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
              {customizedNavigation.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/dashboard" &&
                    item.href !== "/shipments" &&
                    location.startsWith(item.href + "/")) ||
                  (item.href === "/shipments" &&
                    (location === "/shipments" || location.startsWith("/shipments/")));

                const hasCustomColor = isActive && !!item.activeColor;

                const linkEl = (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.href === "/hilfe" ? "help-link" : undefined}
                    className={cn(
                      "flex items-center rounded-md text-sm font-medium transition-all duration-150",
                      collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 px-3 py-2.5",
                      isActive
                        ? hasCustomColor
                          ? "text-white shadow-sm"
                          : "bg-primary text-white shadow-sm dark:bg-white/15 dark:text-white dark:shadow-none"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                    )}
                    style={hasCustomColor ? { backgroundColor: item.activeColor! } : undefined}
                  >
                    <item.NavIcon
                      className={cn(
                        "shrink-0",
                        collapsed ? "w-5 h-5" : "w-4 h-4",
                        isActive ? "text-white" : "text-slate-500"
                      )}
                    />
                    {!collapsed && item.name}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  linkEl
                );
              })}
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
    </TooltipProvider>
  );
}
