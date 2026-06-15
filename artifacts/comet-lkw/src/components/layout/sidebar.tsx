import { useAuth } from "@/contexts/auth-context";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Truck, 
  Building2, 
  Users, 
  PackageSearch, 
  FileCheck2, 
  History,
  LogOut,
  Share2,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const ROLES_WITH_FULL_ACCESS = ["comet_admin", "comet_leitstand", "comet_lager", "comet_viewer"];
const ROLES_WITH_SPEDITION_ACCESS = ["comet_admin", "comet_leitstand"];

export function AppSidebar() {
  const { user, refetch } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/login");
      }
    }
  });

  if (!user) return null;

  const isCometUser = ROLES_WITH_FULL_ACCESS.includes(user.role);
  const canManageSpeditionen = ROLES_WITH_SPEDITION_ACCESS.includes(user.role);
  const canManageUsers = isCometUser ? canManageSpeditionen : user.role === "speditions_admin";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Verladungen", href: "/shipments", icon: Truck, show: true },
    { name: "Speditionen", href: "/speditionen", icon: Building2, show: canManageSpeditionen },
    { name: "Benutzer", href: "/users", icon: Users, show: canManageUsers },
    { name: "Palettenkonto", href: "/paletten", icon: PackageSearch, show: true },
    { name: "Abstimmungen", href: "/abstimmungen", icon: FileCheck2, show: true },
    { name: "Änderungslog", href: "/auditlog", icon: History, show: isCometUser },
    { name: "Speditionsfreigabe", href: "/speditionsfreigabe", icon: Share2, show: user.role === "speditions_admin" },
  ];

  return (
    <div className="w-64 bg-slate-950 text-slate-300 flex flex-col h-full border-r border-slate-900">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold tracking-tighter">
            CO
          </div>
          <span className="font-semibold text-slate-100 tracking-tight">COMET Leitstand</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-3 space-y-0.5">
          {navigation.filter(item => item.show).map((item) => {
            const isActive = location === item.href || (item.href !== "/dashboard" && item.href !== "/shipments" && location.startsWith(item.href + "/")) || (item.href === "/shipments" && (location === "/shipments" || location.startsWith("/shipments/")));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-white" : "text-slate-500")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 uppercase">
            {user.username.substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{user.username}</div>
            <div className="text-xs text-slate-500 truncate">{user.speditionName || "COMET"}</div>
          </div>
        </div>
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
    </div>
  );
}
