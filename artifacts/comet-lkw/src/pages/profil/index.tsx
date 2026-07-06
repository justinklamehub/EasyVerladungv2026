import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCog, KeyRound, CheckCircle2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPatch(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data;
}

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

export default function ProfilPage() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();

  const [profileForm, setProfileForm] = useState({
    username: user?.username ?? "",
    email: user?.email ?? "",
  });
  const [profileLoading, setProfileLoading] = useState(false);

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  if (!user) return null;

  const initials = (user.username ?? "?").slice(0, 2).toUpperCase();

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    try {
      await apiPatch("/api/auth/profile", {
        username: profileForm.username,
        email: profileForm.email || null,
      });
      await refetch();
      toast({ title: "Profil gespeichert", description: "Ihre Daten wurden aktualisiert." });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setProfileLoading(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: "Fehler", description: "Neues Passwort und Bestätigung stimmen nicht überein.", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    setPwSuccess(false);
    try {
      await apiPost("/api/auth/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwSuccess(true);
      toast({ title: "Passwort geändert", description: "Ihr Passwort wurde erfolgreich geändert." });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  }

  const ROLE_LABELS: Record<string, string> = {
    comet_admin: "COMET Admin",
    comet_leitstand: "COMET Leitstand",
    comet_lager: "COMET Lager",
    comet_viewer: "COMET Viewer",
    speditions_admin: "Speditions-Admin",
    speditions_bearbeiter: "Speditions-Bearbeiter",
    speditions_viewer: "Speditions-Viewer",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-white shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user.username}</h1>
          <p className="text-sm text-slate-500">
            {ROLE_LABELS[user.role] ?? user.role}
            {user.speditionName ? ` · ${user.speditionName}` : ""}
          </p>
        </div>
      </div>

      {/* Profile data */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="w-4 h-4 text-slate-500" />
            Profildaten
          </CardTitle>
          <CardDescription>Benutzername und E-Mail-Adresse bearbeiten.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Benutzername</Label>
              <Input
                id="username"
                value={profileForm.username}
                onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))}
                placeholder="benutzername"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={profileForm.email ?? ""}
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@beispiel.de"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={profileLoading}>
                {profileLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-slate-500" />
            Passwort ändern
          </CardTitle>
          <CardDescription>Geben Sie Ihr aktuelles Passwort ein und wählen Sie ein neues.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
              <Input
                id="currentPassword"
                type="password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Neues Passwort</Label>
              <Input
                id="newPassword"
                type="password"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="Mindestens 8 Zeichen"
                required
                autoComplete="new-password"
              />
              <p className="text-xs text-slate-400">Mind. 8 Zeichen, mit Groß- und Kleinbuchstaben sowie einer Zahl.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </div>
            {pwSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Passwort erfolgreich geändert.
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={pwLoading}>
                {pwLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Passwort ändern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
