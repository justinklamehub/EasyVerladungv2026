import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useListUsers } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const ROLE_OPTIONS = [
  { value: "comet_admin", label: "COMET Admin" },
  { value: "comet_leitstand", label: "COMET Leitstand" },
  { value: "comet_lager", label: "COMET Lager" },
  { value: "comet_viewer", label: "COMET Betrachter" },
  { value: "speditions_admin", label: "Speditions-Admin" },
  { value: "speditions_fahrer", label: "Speditions-Fahrer" },
];

interface SendPushDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendPushDialog({ open, onOpenChange }: SendPushDialogProps) {
  const [targetType, setTargetType] = useState<"all" | "role" | "user">("all");
  const [targetRole, setTargetRole] = useState<string>("comet_lager");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const { data: users } = useListUsers(undefined, { query: { enabled: open && targetType === "user" } });

  const reset = () => {
    setTargetType("all");
    setTargetRole("comet_lager");
    setTargetUserId("");
    setTitle("");
    setMessage("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { title, message, target: targetType };
      if (targetType === "role") body.role = targetRole;
      if (targetType === "user") body.userId = Number(targetUserId);

      const res = await fetch(`${API}/push/send-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Fehler beim Senden");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Nachricht gesendet" });
      reset();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (targetType !== "user" || targetUserId);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nachricht senden</DialogTitle>
          <DialogDescription>
            Senden Sie eine eigene Benachrichtigung an alle Benutzer, eine Rolle oder eine bestimmte Person.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Empfänger</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as "all" | "role" | "user")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Benutzer</SelectItem>
                <SelectItem value="role">Nach Rolle</SelectItem>
                <SelectItem value="user">Bestimmter Benutzer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === "role" && (
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType === "user" && (
            <div className="space-y-2">
              <Label>Benutzer</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Benutzer auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="push-title">Titel</Label>
            <Input
              id="push-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Wichtiger Hinweis"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="push-message">Nachricht</Label>
            <Textarea
              id="push-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ihre Nachricht..."
              rows={4}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Abbrechen
          </Button>
          <Button onClick={() => sendMutation.mutate()} disabled={!canSend || sendMutation.isPending}>
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
