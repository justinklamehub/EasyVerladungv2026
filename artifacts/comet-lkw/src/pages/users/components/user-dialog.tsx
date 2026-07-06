import { useState, useEffect } from "react";
import {
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListSpeditionen,
  getListUsersQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserX } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface User {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  speditionId?: number | null;
  isActive?: boolean;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editUser?: User | null;
}

interface RoleInfo {
  roleKey: string;
  label: string;
  roleGroup: string;
  isSystem: boolean;
}

const SPED_GROUP = "Speditionen";
const SPED_GROUP_ALIASES = new Set(["Speditionen", "Spedition"]);

export function UserDialog({ open, onOpenChange, editUser }: UserDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { data: speditionen } = useListSpeditionen();
  const isEditing = !!editUser;
  const isCometAdmin = currentUser?.role === "comet_admin";
  const isSpedAdmin = currentUser?.role === "speditions_admin";

  // Load roles dynamically for comet_admin
  const { data: allRoles = [] } = useQuery<RoleInfo[]>({
    queryKey: ["admin-roles"],
    queryFn: () => customFetch("/api/admin/roles"),
    enabled: isCometAdmin,
    staleTime: 60_000,
  });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("comet_viewer");
  const [speditionId, setSpeditionId] = useState<string>("__none__");

  useEffect(() => {
    if (open) {
      if (editUser) {
        setUsername(editUser.username);
        setEmail(editUser.email ?? "");
        setPassword("");
        setRole(editUser.role);
        setSpeditionId(editUser.speditionId ? String(editUser.speditionId) : "__none__");
      } else {
        setUsername(""); setEmail(""); setPassword("");
        setRole(isSpedAdmin ? "speditions_bearbeiter" : "comet_viewer");
        setSpeditionId("__none__");
      }
    }
  }, [open, editUser, isSpedAdmin]);

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Benutzer erstellt" });
        onOpenChange(false);
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Benutzer gespeichert" });
        onOpenChange(false);
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error ?? "Fehler", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Benutzer deaktiviert" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Fehler beim Deaktivieren", variant: "destructive" }),
    },
  });

  const handleSave = () => {
    if (!username.trim()) { toast({ title: "Benutzername erforderlich", variant: "destructive" }); return; }
    if (!isEditing && !password) { toast({ title: "Passwort erforderlich", variant: "destructive" }); return; }

    const sid = speditionId !== "__none__" ? parseInt(speditionId) : undefined;
    const data: any = { username, email: email || undefined, role: role as any };
    if (password) data.password = password;
    if (sid) data.speditionId = sid;

    if (isEditing && editUser) {
      updateMutation.mutate({ id: editUser.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const handleDeactivate = () => {
    if (editUser) deleteMutation.mutate({ id: editUser.id });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Build available roles list
  let availableRoles: { value: string; label: string; group: string }[];
  if (isCometAdmin && allRoles.length > 0) {
    availableRoles = allRoles.map((r) => ({ value: r.roleKey, label: r.label, group: r.roleGroup }));
  } else if (isSpedAdmin) {
    availableRoles = [
      { value: "speditions_admin", label: "Spedition Admin", group: SPED_GROUP },
      { value: "speditions_bearbeiter", label: "Spedition Bearbeiter", group: SPED_GROUP },
      { value: "speditions_viewer", label: "Spedition Viewer", group: SPED_GROUP },
    ];
  } else {
    availableRoles = [
      { value: "comet_admin", label: "COMET Admin", group: "COMET intern" },
      { value: "comet_leitstand", label: "COMET Leitstand", group: "COMET intern" },
      { value: "comet_lager", label: "COMET Lager", group: "COMET intern" },
      { value: "comet_viewer", label: "COMET Viewer", group: "COMET intern" },
      { value: "speditions_admin", label: "Spedition Admin", group: SPED_GROUP },
      { value: "speditions_bearbeiter", label: "Spedition Bearbeiter", group: SPED_GROUP },
      { value: "speditions_viewer", label: "Spedition Viewer", group: SPED_GROUP },
    ];
  }

  // Group roles for the select
  const groups = Array.from(new Set(availableRoles.map((r) => r.group)));

  // Determine if selected role needs spedition picker
  const selectedRoleInfo = allRoles.find((r) => r.roleKey === role);
  const needsSpedition = isCometAdmin
    ? SPED_GROUP_ALIASES.has(selectedRoleInfo?.roleGroup ?? "")
    : role.startsWith("speditions_");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Benutzer bearbeiten" : "Neuer Benutzer"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Zugangsdaten für ${editUser?.username}` : "Erstellen Sie einen neuen Systemzugang."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Benutzername</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="benutzername" />
          </div>
          <div className="space-y-1">
            <Label>E-Mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
            {!email && !isEditing && (
              <p className="text-xs text-amber-600 flex items-start gap-1 pt-0.5">
                <span>ⓘ</span>
                <span>Zugangsdaten werden an Ihre eigene E-Mail-Adresse gesendet.</span>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{isEditing ? "Neues Passwort (leer lassen = unverändert)" : "Passwort *"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEditing ? "••••••••" : "Passwort eingeben"} />
            <p className="text-xs text-slate-400">
              Mind. 8 Zeichen, mit Groß- und Kleinbuchstaben sowie einer Zahl.
              {isEditing ? " Der Benutzer muss es beim nächsten Login ändern." : " Muss beim ersten Login geändert werden."}
            </p>
          </div>
          <div className="space-y-1">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <div key={group}>
                    <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">{group}</div>
                    {availableRoles.filter((r) => r.group === group).map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSpedition && isCometAdmin && (
            <div className="space-y-1">
              <Label>Spedition</Label>
              <Select value={speditionId} onValueChange={setSpeditionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Keine —</SelectItem>
                  {speditionen?.map(s => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing && editUser?.isActive && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 sm:mr-auto"
              onClick={handleDeactivate}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4 mr-1" />}
              Deaktivieren
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
