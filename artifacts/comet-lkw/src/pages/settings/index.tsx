import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, Type, Mail, Inbox, CheckCircle2, XCircle, Eye, Image, Upload, Trash2 as TrashIcon } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

type SettingsMap = Record<string, string>;

interface EmailLogEntry {
  id: number;
  event: string;
  toAddresses: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
}

const SETTING_LABELS: Record<string, { label: string; description?: string; multiline?: boolean }> = {
  app_name: { label: "App-Name", description: "Wird in der Seitenleiste und auf der Login-Seite angezeigt" },
  company_name: { label: "Unternehmen", description: "Name des Unternehmens" },
  login_subtitle: { label: "Login-Untertitel", description: "Untertitel auf der Login-Seite" },
  default_bemerkung: { label: "Standard-Bemerkung", description: "Wird bei neuen Verladungen vorausgefüllt", multiline: true },
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
];

const EMAIL_EVENTS = [
  {
    key: "shipment",
    label: "Einzel-Verladung angelegt",
    description: "Wird gesendet, wenn eine neue Einzelverladung angelegt wird",
    placeholders: ["{{bezeichnung}}", "{{kennzeichen}}", "{{spedition}}", "{{status}}", "{{datum}}", "{{tabelle}}"],
    recipientNote: "Die E-Mail-Adresse des anlegenden Benutzers wird automatisch als Empfänger hinzugefügt.",
  },
  {
    key: "bulk",
    label: "Massen-Verladung angelegt",
    description: "Wird gesendet, wenn Verladungen per Massenanlage erstellt werden",
    placeholders: ["{{anzahl}}", "{{spedition}}", "{{datum}}", "{{tabelle}}"],
    recipientNote: "Die E-Mail-Adresse des anlegenden Benutzers wird automatisch als Empfänger hinzugefügt.",
  },
  {
    key: "user",
    label: "Benutzer angelegt",
    description: "Wird gesendet, wenn ein neuer Benutzer angelegt wird",
    placeholders: ["{{username}}", "{{email}}", "{{passwort}}", "{{rolle}}", "{{spedition}}"],
    recipientNote: "Die E-Mail-Adresse des neuen Benutzers wird automatisch als Empfänger hinzugefügt (sofern angegeben).",
  },
];

const EVENT_LABELS: Record<string, string> = {
  shipment: "Einzel-Verladung",
  bulk: "Massen-Verladung",
  user: "Benutzer angelegt",
};

// ── SettingField ──────────────────────────────────────────────────────────────

function SettingField({ settingKey, value, onSave, isSaving }: {
  settingKey: string; value: string;
  onSave: (key: string, val: string) => void; isSaving: boolean;
}) {
  const meta = SETTING_LABELS[settingKey];
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const dirty = local !== value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">{meta?.label ?? settingKey}</Label>
          {meta?.description && <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>}
        </div>
        {dirty && (
          <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave(settingKey, local)} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        )}
      </div>
      {meta?.multiline ? (
        <Textarea value={local} onChange={e => setLocal(e.target.value)} placeholder="—" className="text-sm resize-none min-h-[80px]" rows={3} />
      ) : (
        <Input value={local} onChange={e => setLocal(e.target.value)} placeholder="—" className="text-sm" />
      )}
    </div>
  );
}

// ── LogoUploadField ───────────────────────────────────────────────────────────

function LogoUploadField({ value, onSave, isSaving }: {
  value: string;
  onSave: (key: string, val: string) => void;
  isSaving: boolean;
}) {
  const [preview, setPreview] = useState<string>(value);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setPreview(value); }, [value]);
  const dirty = preview !== value;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo darf maximal 2 MB groß sein.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">Firmenlogo</Label>
          <p className="text-xs text-slate-400 mt-0.5">
            Wird auf der Gefahrgut-Checkliste (Druckansicht) angezeigt. PNG, JPG oder SVG, max. 2 MB.
          </p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 px-3 text-xs shrink-0"
            onClick={() => onSave("company_logo", preview)}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="border rounded p-2 bg-slate-50 flex items-center justify-center shrink-0"
          style={{ minWidth: 120, minHeight: 70 }}
        >
          {preview ? (
            <img src={preview} alt="Logo Vorschau" style={{ maxWidth: 110, maxHeight: 60, objectFit: "contain" }} />
          ) : (
            <div className="flex flex-col items-center text-slate-300 gap-1">
              <Image className="w-6 h-6" />
              <span className="text-xs">Kein Logo</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5" /> Logo hochladen
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5 text-red-500 hover:text-red-600"
              onClick={() => setPreview("")}
            >
              <TrashIcon className="w-3.5 h-3.5" /> Logo entfernen
            </Button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
    </div>
  );
}

// ── EmailFromField ────────────────────────────────────────────────────────────

function EmailFromField({ value, onSave, isSaving }: { value: string; onSave: (k: string, v: string) => void; isSaving: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const dirty = local !== value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">Absender (Von)</Label>
          <p className="text-xs text-slate-400 mt-0.5">Adresse, von der alle automatischen E-Mails verschickt werden</p>
        </div>
        {dirty && (
          <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave("email_from", local)} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        )}
      </div>
      <Input value={local} onChange={e => setLocal(e.target.value)} placeholder="noreply-easy-verladung@comet-seasonal.de" className="text-sm" />
    </div>
  );
}

// ── EmailEventSection ─────────────────────────────────────────────────────────

function EmailEventSection({ eventKey, label, description, placeholders, recipientNote, settings, onSave, isSaving }: {
  eventKey: string; label: string; description: string;
  placeholders: string[]; recipientNote: string | null;
  settings: SettingsMap;
  onSave: (key: string, val: string) => void;
  isSaving: (key: string) => boolean;
}) {
  const enabledKey = `email_tpl_${eventKey}_enabled`;
  const toKey = `email_tpl_${eventKey}_to`;
  const subjectKey = `email_tpl_${eventKey}_subject`;
  const bodyKey = `email_tpl_${eventKey}_body`;

  const enabled = settings[enabledKey] === "1";
  const [to, setTo] = useState(settings[toKey] ?? "");
  const [subject, setSubject] = useState(settings[subjectKey] ?? "");
  const [body, setBody] = useState(settings[bodyKey] ?? "");

  useEffect(() => { setTo(settings[toKey] ?? ""); }, [settings[toKey]]);
  useEffect(() => { setSubject(settings[subjectKey] ?? ""); }, [settings[subjectKey]]);
  useEffect(() => { setBody(settings[bodyKey] ?? ""); }, [settings[bodyKey]]);

  const toDirty = to !== (settings[toKey] ?? "");
  const subjectDirty = subject !== (settings[subjectKey] ?? "");
  const bodyDirty = body !== (settings[bodyKey] ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => onSave(enabledKey, v ? "1" : "")} disabled={isSaving(enabledKey)} />
      </div>

      {enabled && (
        <div className="space-y-3 pl-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Empfänger (An)</Label>
                <p className="text-xs text-slate-400 mt-0.5">Mehrere Adressen kommagetrennt</p>
                {recipientNote && <p className="text-xs text-amber-600 mt-0.5">{recipientNote}</p>}
              </div>
              {toDirty && (
                <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave(toKey, to)} disabled={isSaving(toKey)}>
                  {isSaving(toKey) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  Speichern
                </Button>
              )}
            </div>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder="empfaenger@firma.de, zweiter@firma.de" className="text-sm" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-medium text-slate-700">Betreff</Label>
              {subjectDirty && (
                <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave(subjectKey, subject)} disabled={isSaving(subjectKey)}>
                  {isSaving(subjectKey) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  Speichern
                </Button>
              )}
            </div>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="z.B. Neue Verladung: {{bezeichnung}}" className="text-sm" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-medium text-slate-700">E-Mail-Text</Label>
              {bodyDirty && (
                <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave(bodyKey, body)} disabled={isSaving(bodyKey)}>
                  {isSaving(bodyKey) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                  Speichern
                </Button>
              )}
            </div>
            <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Nachrichtentext…" className="text-sm resize-none min-h-[100px]" rows={4} />
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1.5">Verfügbare Platzhalter:</p>
            <div className="flex flex-wrap gap-1">
              {placeholders.map(p => (
                <Badge key={p} variant="secondary" className="font-mono text-xs cursor-default">{p}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EmailLog (Postausgang) ────────────────────────────────────────────────────

function EmailLogSection() {
  const [preview, setPreview] = useState<EmailLogEntry | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery<EmailLogEntry[]>({
    queryKey: ["email-log"],
    queryFn: async () => {
      const res = await fetch(`${API}/email-log`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Postausgang</CardTitle>
            </div>
            <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aktualisieren"}
            </Button>
          </div>
          <CardDescription className="text-xs">Verlauf aller automatisch versendeten E-Mails</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Noch keine E-Mails versendet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">Zeitpunkt</th>
                    <th className="text-left px-4 py-2.5 font-medium">Ereignis</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Empfänger</th>
                    <th className="text-left px-4 py-2.5 font-medium">Betreff</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry, i) => (
                    <tr key={entry.id} className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-xs">{formatDate(entry.sentAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {EVENT_LABELS[entry.event] ?? entry.event}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs hidden md:table-cell max-w-[200px] truncate">{entry.toAddresses}</td>
                      <td className="px-4 py-2.5 text-slate-800 max-w-[220px] truncate">{entry.subject}</td>
                      <td className="px-4 py-2.5">
                        {entry.status === "sent" ? (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Gesendet
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                            <XCircle className="w-3.5 h-3.5" /> Fehler
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {(entry.bodyHtml || entry.bodyText) && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreview(entry)}>
                            <Eye className="w-3.5 h-3.5 mr-1" /> Vorschau
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold truncate pr-4">{preview?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-slate-500">
            <p><span className="font-medium">An:</span> {preview?.toAddresses}</p>
            <p><span className="font-medium">Zeitpunkt:</span> {preview ? formatDate(preview.sentAt) : ""}</p>
            {preview?.errorMessage && (
              <p className="text-red-500"><span className="font-medium">Fehler:</span> {preview.errorMessage}</p>
            )}
          </div>
          <Separator className="my-3" />
          {preview?.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-sm border rounded p-4 bg-white"
              dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
            />
          ) : (
            <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-4 border">{preview?.bodyText}</pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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

  const handleSave = (key: string, value: string) => saveMutation.mutate({ key, value });
  const isSavingKey = (key: string) => saveMutation.isPending && (saveMutation.variables as any)?.key === key;

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

      <Tabs defaultValue="allgemein" className="space-y-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="allgemein" className="flex items-center gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" /> Allgemein
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 text-xs">
            <Mail className="w-3.5 h-3.5" /> E-Mail-Vorlagen
          </TabsTrigger>
          <TabsTrigger value="postausgang" className="flex items-center gap-1.5 text-xs">
            <Inbox className="w-3.5 h-3.5" /> Postausgang
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Allgemein ── */}
        <TabsContent value="allgemein" className="space-y-5 mt-0">
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
                      <SettingField settingKey={key} value={s[key] ?? ""} onSave={handleSave} isSaving={isSavingKey(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Logo</CardTitle>
              </div>
              <CardDescription className="text-xs">Firmenlogo für Druckdokumente (Gefahrgut-Checkliste)</CardDescription>
            </CardHeader>
            <CardContent>
              <LogoUploadField value={s["company_logo"] ?? ""} onSave={handleSave} isSaving={isSavingKey("company_logo")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: E-Mail-Vorlagen ── */}
        <TabsContent value="email" className="space-y-5 mt-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">E-Mail-Benachrichtigungen</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Automatische E-Mails bei bestimmten Ereignissen. Der Server versendet E-Mails über den lokalen Mailserver (wie PHP mail()).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <EmailFromField value={s["email_from"] ?? ""} onSave={handleSave} isSaving={isSavingKey("email_from")} />
              <Separator />
              {EMAIL_EVENTS.map((ev, i) => (
                <div key={ev.key}>
                  {i > 0 && <Separator />}
                  <EmailEventSection
                    eventKey={ev.key}
                    label={ev.label}
                    description={ev.description}
                    placeholders={ev.placeholders}
                    recipientNote={ev.recipientNote}
                    settings={s}
                    onSave={handleSave}
                    isSaving={isSavingKey}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Postausgang ── */}
        <TabsContent value="postausgang" className="mt-0">
          <EmailLogSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
