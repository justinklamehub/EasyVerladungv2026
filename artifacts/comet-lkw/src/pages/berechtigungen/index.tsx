import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, Lock, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { PushEventSettings } from "@/components/push-event-settings";
import { cn } from "@/lib/utils";

interface RoleInfo {
  roleKey: string;
  label: string;
  roleGroup: string;
  isSystem: boolean;
}

interface PermEntry { role: string; permission: string; allowed: boolean; }
interface PermLabel { label: string; category: string; }

interface PermissionsData {
  matrix: PermEntry[];
  permissions: string[];
  roles: RoleInfo[];
  permissionLabels: Record<string, PermLabel>;
}

const SUPERADMIN = "comet_admin";

const CATEGORY_COLORS: Record<string, string> = {
  Palettenbuchungen:      "bg-blue-50 text-blue-800 border-blue-200",
  Verladungen:            "bg-green-50 text-green-800 border-green-200",
  Austragen:              "bg-orange-50 text-orange-800 border-orange-200",
  Abstimmungen:           "bg-purple-50 text-purple-800 border-purple-200",
  Speditionsverwaltung:   "bg-indigo-50 text-indigo-800 border-indigo-200",
  "KI-Wissensdatenbank":  "bg-teal-50 text-teal-800 border-teal-200",
};

const VIEWER_LOCKED = new Set(["comet_viewer", "speditions_viewer"]);

const BUILT_IN_GROUPS = ["COMET intern", "Speditionen"];
const COMET_GROUP_ALIASES = new Set(["COMET intern", "COMET"]);
const SPED_GROUP_ALIASES  = new Set(["Speditionen", "Spedition"]);

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "");
}

export default function BerechtigungenPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const qKey = ["admin-permissions"];

  const { data, isLoading } = useQuery<PermissionsData>({
    queryKey: qKey,
    queryFn: () => customFetch("/api/admin/permissions"),
  });

  // ── inline rename state ──────────────────────────────────────────────────
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const renameMutation = useMutation({
    mutationFn: ({ key, label }: { key: string; label: string }) =>
      customFetch(`/api/admin/roles/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ label }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_, { key, label }) => {
      qc.setQueryData<PermissionsData>(qKey, (old) =>
        old ? { ...old, roles: old.roles.map((r) => r.roleKey === key ? { ...r, label } : r) } : old
      );
      setEditing(null);
    },
    onError: () => toast({ title: "Fehler beim Umbenennen", variant: "destructive" }),
  });

  // ── add role state ───────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", roleKey: "", roleGroup: "COMET intern" });

  const addMutation = useMutation({
    mutationFn: (form: typeof addForm) =>
      customFetch("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (newRole: RoleInfo) => {
      qc.setQueryData<PermissionsData>(qKey, (old) => {
        if (!old) return old;
        const newPerms = old.permissions.map((p) => ({ role: newRole.roleKey, permission: p, allowed: false }));
        return { ...old, roles: [...old.roles, newRole], matrix: [...old.matrix, ...newPerms] };
      });
      toast({ title: `Rolle "${newRole.label}" angelegt` });
      setShowAdd(false);
      setAddForm({ label: "", roleKey: "", roleGroup: "COMET intern" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler beim Anlegen", variant: "destructive" }),
  });

  // ── delete role state ────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (key: string) =>
      customFetch(`/api/admin/roles/${key}`, { method: "DELETE" }),
    onSuccess: (_, key) => {
      qc.setQueryData<PermissionsData>(qKey, (old) =>
        old ? { ...old, roles: old.roles.filter((r) => r.roleKey !== key), matrix: old.matrix.filter((m) => m.role !== key) } : old
      );
      toast({ title: "Rolle gelöscht" });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast({ title: e?.message ?? "Fehler beim Löschen", variant: "destructive" }),
  });

  // ── toggle permission ────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: (p: { role: string; permission: string; allowed: boolean }) =>
      customFetch("/api/admin/permissions", {
        method: "PATCH",
        body: JSON.stringify(p),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_, v) => {
      qc.setQueryData<PermissionsData>(qKey, (old) =>
        old ? {
          ...old,
          matrix: old.matrix.map((m) =>
            m.role === v.role && m.permission === v.permission ? { ...m, allowed: v.allowed } : m
          ),
        } : old
      );
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  if (user?.role !== "comet_admin") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Lock className="w-12 h-12" />
        <p className="text-sm">Nur COMET Admin hat Zugriff auf diese Seite.</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const lookup = new Map<string, boolean>();
  for (const e of data.matrix) lookup.set(`${e.role}::${e.permission}`, e.allowed);

  const isAllowed = (role: string, perm: string) => role === SUPERADMIN || (lookup.get(`${role}::${perm}`) ?? false);
  const isLocked = (role: string) => role === SUPERADMIN || VIEWER_LOCKED.has(role);

  const categories = Array.from(new Set(data.permissions.map((p) => data.permissionLabels[p]?.category ?? "Sonstiges")));

  // Sort roles: superadmin first, then by group order, then others
  const roleOrder = (r: RoleInfo) => {
    if (r.roleKey === SUPERADMIN) return 0;
    if (COMET_GROUP_ALIASES.has(r.roleGroup)) return 1;
    if (SPED_GROUP_ALIASES.has(r.roleGroup))  return 2;
    return 3;
  };
  const displayRoles = [...data.roles]
    .filter((r): r is RoleInfo => typeof r === "object" && r !== null && typeof r.label === "string")
    .sort((a, b) => roleOrder(a) - roleOrder(b) || a.label.localeCompare(b.label));

  const availableGroups = Array.from(new Set([...BUILT_IN_GROUPS, ...displayRoles.map((r) => r.roleGroup)]));

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-primary flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Rollenberechtigungen</h1>
            <p className="text-sm text-slate-500">
              Bearbeiten Sie Rollennamen, legen Sie neue Rollen an und verwalten Sie deren Berechtigungen.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1.5" />Neue Rolle
        </Button>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left py-3 px-4 font-semibold text-slate-600 w-48 min-w-[160px]">Aktion</th>
              {displayRoles.map((role) => {
                const locked = isLocked(role.roleKey);
                const isEditing = editing?.key === role.roleKey;
                return (
                  <th key={role.roleKey} className="py-2 px-3 text-center font-medium text-slate-700 min-w-[120px] max-w-[150px]">
                    <div className="flex flex-col items-center gap-1.5">
                      {/* Editable label */}
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-6 text-xs px-1.5 w-24"
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameMutation.mutate({ key: role.roleKey, label: editing.value });
                              if (e.key === "Escape") setEditing(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => renameMutation.mutate({ key: role.roleKey, label: editing.value })}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className="text-xs font-semibold text-center leading-tight">{role.label}</span>
                          <button
                            onClick={() => setEditing({ key: role.roleKey, value: role.label })}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700"
                            title="Umbenennen"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {/* Group badge */}
                      <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal text-slate-400 border-slate-200">
                        {role.roleGroup}
                      </Badge>

                      {/* Status indicators */}
                      <div className="flex items-center gap-1">
                        {role.roleKey === SUPERADMIN && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-yellow-50 text-yellow-700 border-yellow-200">Admin</Badge>
                        )}
                        {VIEWER_LOCKED.has(role.roleKey) && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-100 text-slate-500 border-slate-200">
                            <Lock className="w-2 h-2 mr-0.5" />Lesen
                          </Badge>
                        )}
                        {!role.isSystem && (
                          <button
                            onClick={() => setConfirmDelete(role.roleKey)}
                            className="text-red-300 hover:text-red-500 transition-colors"
                            title="Rolle löschen"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      {/* role_key hint */}
                      <span className="text-[9px] font-mono text-slate-300">{role.roleKey}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, ci) => {
              const permsInCat = data.permissions.filter((p) => data.permissionLabels[p]?.category === cat);
              return (
                <>
                  <tr key={`cat-${cat}`} className="bg-slate-50/60">
                    <td colSpan={displayRoles.length + 1} className="py-2 px-4">
                      <Badge variant="outline" className={cn("text-xs font-semibold", CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-600 border-slate-200")}>
                        {cat}
                      </Badge>
                    </td>
                  </tr>
                  {permsInCat.map((perm, pi) => (
                    <tr
                      key={perm}
                      className={cn("hover:bg-slate-50/50 transition-colors", (pi < permsInCat.length - 1 || ci < categories.length - 1) && "border-b border-slate-100")}
                    >
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {data.permissionLabels[perm]?.label ?? perm}
                      </td>
                      {displayRoles.map((role) => {
                        const allowed = isAllowed(role.roleKey, perm);
                        const locked = isLocked(role.roleKey);
                        return (
                          <td key={role.roleKey} className="py-3 px-3 text-center">
                            <div className="flex justify-center">
                              <Switch
                                checked={allowed}
                                disabled={locked || toggleMutation.isPending}
                                onCheckedChange={(val) => !locked && toggleMutation.mutate({ role: role.roleKey, permission: perm, allowed: val })}
                                className={locked ? "opacity-35 cursor-not-allowed" : ""}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 text-center">
        Änderungen werden sofort gespeichert und wirken beim nächsten API-Request.
        Rollennamen umbenennen: Hover über den Spaltentitel → Stift-Icon klicken.
      </p>

      {/* ── Add Role Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setAddForm({ label: "", roleKey: "", roleGroup: "COMET intern" }); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Neue Rolle anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Anzeigename *</Label>
              <Input
                placeholder="z.B. Lager Senior"
                value={addForm.label}
                onChange={(e) => {
                  const label = e.target.value;
                  setAddForm((f) => ({
                    ...f,
                    label,
                    roleKey: f.roleKey || slugify(label),
                  }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Interner Schlüssel *</Label>
              <Input
                placeholder="lager_senior"
                value={addForm.roleKey}
                onChange={(e) => setAddForm((f) => ({ ...f, roleKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                className="font-mono"
              />
              <p className="text-xs text-slate-400">Kleinbuchstaben, Ziffern und _ — wird in der Datenbank gespeichert.</p>
            </div>
            <div className="space-y-1">
              <Label>Gruppe</Label>
              <Select value={addForm.roleGroup} onValueChange={(v) => setAddForm((f) => ({ ...f, roleGroup: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button
              onClick={() => addMutation.mutate(addForm)}
              disabled={addMutation.isPending || !addForm.label.trim() || !addForm.roleKey.trim()}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Push-Ereignisse ────────────────────────────────────────────────── */}
      <PushEventSettings />

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rolle löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Die Rolle <strong>{data.roles.find((r) => r.roleKey === confirmDelete)?.label}</strong> und alle ihre Berechtigungen werden dauerhaft gelöscht.
            Benutzer mit dieser Rolle müssen zuerst umgestellt werden.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Abbrechen</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
