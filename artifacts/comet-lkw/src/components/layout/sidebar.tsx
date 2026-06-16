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
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ROLES_WITH_FULL_ACCESS = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const ROLES_WITH_SPEDITION_ACCESS = ["comet_admin", "comet_leitstand"];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { user, refetch } = useAuth();
  const [location, setLocation] = useLocation();
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
    { name: "Änderungslog", href: "/auditlog", icon: History, show: isCometUser },
    { name: "Speditionsfreigabe", href: "/speditionsfreigabe", icon: Share2, show: user.role === "speditions_admin" },
    { name: "Einstellungen", href: "/settings", icon: Settings, show: user.role === "comet_admin" },
    { name: "Berechtigungen", href: "/berechtigungen", icon: ShieldCheck, show: user.role === "comet_admin" },
  ];

  const initials = user.username.substring(0, 2).toUpperCase();

  return (
    <TooltipProvider delayDuration={0}>
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
                      ? "bg-primary text-white shadow-sm"
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
    </TooltipProvider>
  );
}
