import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLogin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const forceLoggedOut = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reason") === "admin";

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
  const loginSubtitle = pubSettings?.login_subtitle || "LKW-Verladungsverwaltung";

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        refetch();
        setLocation(data?.passwordChangeRequired ? "/passwort-aendern" : "/dashboard");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Fehler beim Anmelden",
          description: "Bitte überprüfen Sie Ihre Zugangsdaten.",
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { identifier, password } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardHeader className="space-y-1 text-center pb-6 border-b border-slate-100">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-2xl tracking-tighter">
              CO
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            {appName}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {loginSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {forceLoggedOut && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Sie wurden von einem Administrator abgemeldet.</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">E-Mail oder Benutzername</Label>
              <Input
                id="identifier"
                placeholder="name@spedition.de"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full mt-2" 
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anmelden
            </Button>
          </form>
        </CardContent>
        <div className="px-6 pb-5 text-center space-y-3">
          <Link href="/forgot-password" className="block text-sm text-slate-400 hover:text-slate-600 transition-colors">
            Passwort vergessen?
          </Link>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
            <Link href="/impressum" className="hover:text-slate-600 transition-colors">Impressum</Link>
            <span aria-hidden="true">·</span>
            <Link href="/datenschutz" className="hover:text-slate-600 transition-colors">Datenschutzerklärung</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
