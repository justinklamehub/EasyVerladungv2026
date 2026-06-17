import { useState } from "react";
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
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { useLocation as useWouterLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

const ROLES_WITH_FULL_ACCESS = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const ROLES_WITH_SPEDITION_ACCESS = ["comet_admin", "comet_leitstand"];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
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
  const { notifications, unreadCount, markRead, markAllRead, dismiss, dismissAll } = useNotifications();

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

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Verladungen", href: "/shipments", icon: Truck, show: true },
    { name: "Wochenplan", href: "/wochenansicht", icon: CalendarDays, show: true },
    { name: "Speditionen", href: "/speditionen", icon: Building2, show: canManageSpeditionen },
    { name: "Benutzer", href: "/users", icon: Users, show: canManageUsers },
    { name: "Palettenkonto", href: "/paletten", icon: PackageSearch, show: true },
    { name: "Abstimmungen", href: "/abstimmungen", icon: FileCheck2, show: true },
    { name: "Auswertung", href: "/auswertung", icon: BarChart2, show: isCometUser },
    { name: "Änderungslog", href: "/auditlog", icon: History, show: isCometUser },
    { name: "Speditionsfreigabe", href: "/speditionsfreigabe", icon: Share2, show: user.role === "speditions_admin" },
    { name: "Einstellungen", href: "/settings", icon: Settings, show: user.role === "comet_admin" },
    { name: "Berechtigungen", href: "/berechtigungen", icon: ShieldCheck, show: user.role === "comet_admin" },
  ];

  const initials = user.username.substring(0, 2).toUpperCase();

  const bellButton = (
    <button
      onClick={() => setShowNotifications((v) => !v)}
      className={cn(
        "relative rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors",
        collapsed ? "w-9 h-9 flex items-center justify-center mx-auto" : "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium",
        showNotifications && "bg-slate-800 text-slate-200"
      )}
    >
      <div className="relative shrink-0">
        <Bell className={cn(collapsed ? "w-5 h-5" : "w-4 h-4")} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
      {!collapsed && <span>Benachrichtigungen</span>}
    </button>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="relative flex h-full">
        {/* Notification panel — fixed so it isn't clipped by overflow-hidden ancestors */}
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
                  Easy-Verladung
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
              {navigation.filter((item) => item.show).map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/dashboard" &&
                    item.href !== "/shipments" &&
                    location.startsWith(item.href + "/")) ||
                  (item.href === "/shipments" &&
                    (location === "/shipments" || location.startsWith("/shipments/")));

                const linkEl = (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-md text-sm font-medium transition-all duration-150",
                      collapsed ? "justify-center w-9 h-9 mx-auto" : "gap-3 px-3 py-2.5",
                      isActive
                        ? "bg-primary text-white shadow-sm dark:bg-white/15 dark:text-white dark:shadow-none"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                    )}
                  >
                    <item.icon
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
                  <Tooltip key={item.name}>
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
          <div className={cn("border-t border-slate-800 bg-slate-900/30 shrink-0", collapsed ? "p-2" : "p-4")}>
            {!collapsed && (
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 uppercase shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{user.username}</div>
                  <div className="text-xs text-slate-500 truncate">{user.speditionName || "COMET"}</div>
                </div>
              </div>
            )}

            {collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    {bellButton}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Benachrichtigungen{unreadCount > 0 ? ` (${unreadCount})` : ""}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onToggleTheme}
                      className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
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
                      className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <UserCog className="w-5 h-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">Mein Profil</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => logoutMutation.mutate()}
                      className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Abmelden ({user.username})
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {bellButton}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  onClick={onToggleTheme}
                >
                  {isDark
                    ? <Sun className="w-4 h-4 mr-2" />
                    : <Moon className="w-4 h-4 mr-2" />}
                  {isDark ? "Hellmodus" : "Dunkelmodus"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  asChild
                >
                  <Link href="/profil">
                    <UserCog className="w-4 h-4 mr-2" />
                    Mein Profil
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Abmelden
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
