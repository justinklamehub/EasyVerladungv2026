import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, BellRing, BellOff, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const ROLE_LABELS: Record<string, string> = {
  comet_admin:            "COMET Admin",
  comet_leitstand:        "Leitstand",
  comet_lager:            "Lager",
  comet_viewer:           "Viewer",
  speditions_admin:       "Sped. Admin",
  speditions_bearbeiter:  "Bearbeiter",
  speditions_viewer:      "Sped. Viewer",
};

const ALL_ROLES = Object.keys(ROLE_LABELS);

interface PushEventSetting {
  event_key: string;
  label: string;
  description: string;
  enabled: boolean;
  target_roles: string[];
}

function RoleToggle({
  role,
  active,
  onChange,
  disabled,
}: {
  role: string;
  active: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!active)}
      disabled={disabled}
      className={cn(
        "text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors select-none",
        active
          ? "bg-primary text-white border-primary"
          : "bg-white text-slate-400 border-slate-200 hover:border-slate-400",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {ROLE_LABELS[role] ?? role}
    </button>
  );
}

export function PushEventSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const qKey = ["push-event-settings"];
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading } = useQuery<PushEventSetting[]>({
    queryKey: qKey,
    queryFn: () =>
      fetch(`${API}/push/event-settings`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ event_key, enabled, target_roles }: Partial<PushEventSetting> & { event_key: string }) =>
      fetch(`${API}/push/event-settings/${encodeURIComponent(event_key)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, target_roles }),
      }).then((r) => {
        if (!r.ok) throw new Error("Fehler");
        return r.json();
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qKey });
      const prev = qc.getQueryData<PushEventSetting[]>(qKey);
      qc.setQueryData<PushEventSetting[]>(qKey, (old) =>
        old?.map((e) =>
          e.event_key === vars.event_key ? { ...e, ...vars } : e
        )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => {
      qc.setQueryData(qKey, ctx?.prev);
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Einstellung gespeichert" });
    },
  });

  const toggleEnabled = (ev: PushEventSetting) => {
    patchMutation.mutate({
      event_key: ev.event_key,
      enabled: !ev.enabled,
      target_roles: ev.target_roles,
    });
  };

  const toggleRole = (ev: PushEventSetting, role: string) => {
    const roles = ev.target_roles.includes(role)
      ? ev.target_roles.filter((r) => r !== role)
      : [...ev.target_roles, role];
    patchMutation.mutate({
      event_key: ev.event_key,
      enabled: ev.enabled,
      target_roles: roles,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <BellRing className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Push-Benachrichtigungs-Ereignisse</p>
            <p className="text-xs text-slate-500">
              Festlegen, bei welchen Aktionen eine Push-Nachricht gesendet wird und an welche Rollen.
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Keine Ereignisse konfiguriert.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.map((ev) => (
                <div key={ev.event_key} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    {/* Toggle */}
                    <div className="flex items-center pt-0.5">
                      <Switch
                        checked={ev.enabled}
                        onCheckedChange={() => toggleEnabled(ev)}
                        disabled={patchMutation.isPending}
                      />
                    </div>

                    {/* Label + Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-medium", ev.enabled ? "text-slate-900" : "text-slate-400")}>
                          {ev.label}
                        </span>
                        {!ev.enabled && (
                          <Badge variant="outline" className="text-[10px] py-0 text-slate-400 border-slate-200">
                            <BellOff className="w-2.5 h-2.5 mr-1" />
                            Deaktiviert
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{ev.description}</p>

                      {/* Role toggles */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {ALL_ROLES.map((role) => (
                          <RoleToggle
                            key={role}
                            role={role}
                            active={ev.target_roles.includes(role)}
                            onChange={() => toggleRole(ev, role)}
                            disabled={!ev.enabled || patchMutation.isPending}
                          />
                        ))}
                      </div>

                      {ev.enabled && ev.target_roles.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          ⚠️ Keine Rollen ausgewählt — Push wird an niemanden gesendet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
