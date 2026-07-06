import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert, LogOut } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data;
}

export default function PasswortAendernPage() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/login");
      },
    },
  });

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast({ title: "Fehler", description: "Neues Passwort und Bestätigung stimmen nicht überein.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast({ title: "Passwort geändert", description: "Ihr Passwort wurde erfolgreich aktualisiert." });
      await refetch();
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardHeader className="space-y-1 text-center pb-6 border-b border-slate-100">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
            Passwort ändern erforderlich
          </CardTitle>
          <CardDescription className="text-slate-500">
            Bitte legen Sie ein neues Passwort fest, bevor Sie fortfahren.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
              <Input
                id="currentPassword"
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                required
                autoComplete="current-password"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                required
                autoComplete="new-password"
                className="bg-white"
              />
              <p className="text-xs text-slate-400">Mind. 8 Zeichen, mit Groß- und Kleinbuchstaben sowie einer Zahl.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                required
                autoComplete="new-password"
                className="bg-white"
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Passwort ändern
            </Button>
          </form>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="mt-4 w-full flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Abmelden
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
