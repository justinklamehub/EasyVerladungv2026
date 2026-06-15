import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, Type, Mail, Building2 } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type SettingsMap = Record<string, string>;

const SETTING_LABELS: Record<string, { label: string; description?: string; multiline?: boolean }> = {
  app_name: { label: "App-Name", description: "Wird in der Seitenleiste und auf der Login-Seite angezeigt" },
  company_name: { label: "Unternehmen", description: "Name des Unternehmens" },
  login_subtitle: { label: "Login-Untertitel", description: "Untertitel auf der Login-Seite" },
  default_bemerkung: { label: "Standard-Bemerkung", description: "Wird bei neuen Verladungen vorausgefüllt", multiline: true },
  email_subject_template: { label: "E-Mail-Betreff-Vorlage", description: "Vorlage für den Betreff von Benachrichtigungen" },
  email_body_template: { label: "E-Mail-Text-Vorlage", description: "Vorlage für den Inhalt von Benachrichtigungen", multiline: true },
};

const SECTIONS = [
  {
    title: "Allgemein",
    description: "Grundlegende Einstellungen für das System",
    icon: Settings,
    keys: ["app_name", "company_name", "login_subtitle"],
  },
  {
    title: "Texte & Vorlagen",
    description: "Standardtexte und Vorlagen für Formulare",
    icon: Type,
    keys: ["default_bemerkung"],
  },
  {
    title: "E-Mail-Entwürfe",
    description: "Vorlagen für automatische E-Mail-Benachrichtigungen",
    icon: Mail,
    keys: ["email_subject_template", "email_body_template"],
  },
];

function SettingField({
  settingKey,
  value,
  onSave,
  isSaving,
}: {
  settingKey: string;
  value: string;
  onSave: (key: string, val: string) => void;
  isSaving: boolean;
}) {
  const meta = SETTING_LABELS[settingKey];
  const [local, setLocal] = useState(value);
  const dirty = local !== value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">{meta?.label ?? settingKey}</Label>
          {meta?.description && (
            <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
          )}
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 px-3 text-xs shrink-0"
            onClick={() => onSave(settingKey, local)}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        )}
      </div>
      {meta?.multiline ? (
        <Textarea
          value={local}
          onChange={e => setLocal(e.target.value)}
          placeholder="—"
          className="text-sm resize-none min-h-[80px]"
          rows={3}
        />
      ) : (
        <Input
          value={local}
          onChange={e => setLocal(e.target.value)}
          placeholder="—"
          className="text-sm"
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch(`${API}/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`${API}/settings/${key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(), { response: { data: body } });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Einstellung gespeichert" });
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.error ?? "Fehler beim Speichern", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const s = settings ?? {};

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Einstellungen</h1>
        <p className="text-sm text-slate-500 mt-1">Globale Systemkonfiguration — nur für COMET-Admins sichtbar</p>
      </div>

      {SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        return (
          <Card key={section.title} className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <SectionIcon className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">{section.title}</CardTitle>
              </div>
              <CardDescription className="text-xs">{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {section.keys.map((key, i) => (
                <div key={key}>
                  {i > 0 && <Separator className="mb-5" />}
                  <SettingField
                    settingKey={key}
                    value={s[key] ?? ""}
                    onSave={(k, v) => saveMutation.mutate({ key: k, value: v })}
                    isSaving={saveMutation.isPending && (saveMutation.variables as any)?.key === key}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
