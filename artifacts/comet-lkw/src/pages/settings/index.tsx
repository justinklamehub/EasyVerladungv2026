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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Settings, Type, Mail, Inbox, CheckCircle2, XCircle, Eye, EyeOff, Image, Upload, Trash2 as TrashIcon, PanelLeft, Send, Server, ChevronUp, ChevronDown, Table2, Calculator, BarChart2, BellRing, RefreshCw, Terminal, Scale, FileClock, Plus, Pencil, Globe, GlobeLock, HardDrive, Palette, ShieldCheck, Tag, X } from "lucide-react";
import { SidebarNavConfig } from "./sidebar-nav-config";
import { useAuth } from "@/contexts/auth-context";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

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
  page_title: { label: "Browser-Titel (<title>)", description: "Wird im Tab des Browsers angezeigt" },
  default_bemerkung: { label: "Standard-Bemerkung", description: "Wird bei neuen Verladungen vorausgefüllt", multiline: true },
  storage_local_path: { label: "Lokaler Speicherpfad", description: "Verzeichnis auf dem Server, in dem Dateien abgelegt werden (nur bei Backend „Lokale Festplatte“)" },
};

const SECTIONS = [
  {
    title: "Allgemein",
    description: "Grundlegende Einstellungen für das System",
    icon: Settings,
    keys: ["app_name", "company_name", "login_subtitle", "page_title"],
  },
  {
    title: "Texte & Vorlagen",
    description: "Standardtexte und Vorlagen für Formulare",
    icon: Type,
    keys: ["default_bemerkung"],
  },
];

const SHIPMENT_TABLE_FIELDS = [
  { key: "bezeichnung", label: "Bezeichnung" },
  { key: "kennzeichen", label: "Kennzeichen" },
  { key: "spedition", label: "Spedition" },
  { key: "subSpedition", label: "Sub-Spedition" },
  { key: "relation", label: "Relation" },
  { key: "lkwArt", label: "LKW-Art" },
  { key: "telefon", label: "Telefon Fahrer" },
  { key: "eta", label: "ETA" },
  { key: "ata", label: "ATA" },
  { key: "tor", label: "Tor" },
  { key: "status", label: "Status" },
  { key: "wareStatus", label: "Ware-Status" },
  { key: "datum", label: "Datum (E-Mail)" },
  { key: "bemerkungen", label: "Bemerkungen" },
];

const BULK_DEFAULT_ENABLED = ["bezeichnung", "kennzeichen", "spedition", "status"];

const BULK_TABLE_FIELDS = [
  { key: "bezeichnung",  label: "Bezeichnung" },
  { key: "kennzeichen",  label: "Kennzeichen" },
  { key: "spedition",    label: "Spedition" },
  { key: "subSpedition", label: "Sub-Spedition" },
  { key: "relation",     label: "Relation" },
  { key: "lkwArt",       label: "LKW-Art" },
  { key: "telefon",      label: "Telefon Fahrer" },
  { key: "eta",          label: "ETA" },
  { key: "ata",          label: "ATA" },
  { key: "tor",          label: "Tor" },
  { key: "status",       label: "Status" },
  { key: "wareStatus",   label: "Ware-Status" },
  { key: "datum",        label: "Datum (E-Mail)" },
  { key: "bemerkungen",  label: "Bemerkungen" },
];

const EMAIL_EVENTS = [
  {
    key: "shipment",
    label: "Einzel-Verladung angelegt",
    description: "Wird gesendet, wenn eine neue Einzelverladung angelegt wird",
    placeholders: ["{{bezeichnung}}", "{{kennzeichen}}", "{{spedition}}", "{{status}}", "{{datum}}", "{{tabelle}}"],
    recipientNote: "Die E-Mail-Adresse des anlegenden Benutzers wird automatisch als Empfänger hinzugefügt.",
    tableFieldsKey: "email_tpl_shipment_tabelle_felder" as string,
    availableFields: SHIPMENT_TABLE_FIELDS,
    defaultEnabledKeys: null as string[] | null,
  },
  {
    key: "bulk",
    label: "Massen-Verladung angelegt",
    description: "Wird gesendet, wenn Verladungen per Massenanlage erstellt werden",
    placeholders: ["{{anzahl}}", "{{spedition}}", "{{datum}}", "{{tabelle}}"],
    recipientNote: "Die E-Mail-Adresse des anlegenden Benutzers wird automatisch als Empfänger hinzugefügt.",
    tableFieldsKey: "email_tpl_bulk_tabelle_felder" as string,
    availableFields: BULK_TABLE_FIELDS,
    defaultEnabledKeys: BULK_DEFAULT_ENABLED,
  },
  {
    key: "user",
    label: "Benutzer angelegt",
    description: "Wird gesendet, wenn ein neuer Benutzer angelegt wird",
    placeholders: ["{{username}}", "{{email}}", "{{passwort}}", "{{rolle}}", "{{spedition}}"],
    recipientNote: "Die E-Mail-Adresse des neuen Benutzers wird automatisch als Empfänger hinzugefügt (sofern angegeben).",
    tableFieldsKey: null as string | null,
    availableFields: null as { key: string; label: string }[] | null,
    defaultEnabledKeys: null as string[] | null,
  },
  {
    key: "password_expiry",
    label: "Passwort läuft bald ab",
    description: "Wird als Erinnerung gesendet, bevor das Passwort eines Benutzers abläuft",
    placeholders: ["{{username}}", "{{email}}", "{{tage}}", "{{ablaufdatum}}"],
    recipientNote: "Die E-Mail-Adresse des betroffenen Benutzers wird automatisch als Empfänger hinzugefügt.",
    tableFieldsKey: null as string | null,
    availableFields: null as { key: string; label: string }[] | null,
    defaultEnabledKeys: null as string[] | null,
  },
  {
    key: "reconciliation_opened",
    label: "Abstimmung eröffnet",
    description: "Wird gesendet, wenn eine neue Paletten-Abstimmung eröffnet wird",
    placeholders: ["{{spedition}}", "{{zeitraum_von}}", "{{zeitraum_bis}}", "{{erstellt_von}}", "{{datum}}"],
    recipientNote: "E-Mail-Adressen der Spedition und ihrer Kontakte sowie des Erstellers werden automatisch als Empfänger hinzugefügt.",
    tableFieldsKey: null as string | null,
    availableFields: null as { key: string; label: string }[] | null,
    defaultEnabledKeys: null as string[] | null,
  },
  {
    key: "reconciliation_reminder",
    label: "Abstimmungs-Erinnerung",
    description: "Wird gesendet, wenn innerhalb des konfigurierten Zeitraums kein Salden-Eintrag durch die Spedition erfolgte",
    placeholders: ["{{spedition}}", "{{zeitraum_von}}", "{{zeitraum_bis}}", "{{tage}}", "{{datum}}"],
    recipientNote: "E-Mail-Adressen der Spedition und ihrer Kontakte sowie des Erstellers werden automatisch als Empfänger hinzugefügt.",
    tableFieldsKey: null as string | null,
    availableFields: null as { key: string; label: string }[] | null,
    defaultEnabledKeys: null as string[] | null,
  },
];

const EVENT_LABELS: Record<string, string> = {
  shipment: "Einzel-Verladung",
  bulk: "Massen-Verladung",
  user: "Benutzer angelegt",
  password_expiry: "Passwort läuft ab",
  reconciliation_opened: "Abstimmung eröffnet",
  reconciliation_reminder: "Abstimmungs-Erinnerung",
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

// ── KalkulationStartortField ──────────────────────────────────────────────────

function KalkulationStartortField({ value, onSave, isSaving }: { value: string; onSave: (k: string, v: string) => void; isSaving: boolean }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="flex gap-2">
      <Input
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder="z.B. Musterstraße 1, 12345 Musterstadt"
        onBlur={() => { if (local !== value) onSave("kalkulation_startort", local); }}
        className="flex-1"
      />
      {isSaving && <Loader2 className="w-4 h-4 animate-spin text-slate-400 self-center" />}
    </div>
  );
}

// ── StorageSettingsCard ───────────────────────────────────────────────────────

function StorageSettingsCard({ settings, onSave, isSaving }: {
  settings: SettingsMap;
  onSave: (key: string, val: string) => void;
  isSaving: (key: string) => boolean;
}) {
  const backend = settings["storage_backend"] || "gcs";
  const [localPath, setLocalPath] = useState(settings["storage_local_path"] ?? "");
  useEffect(() => { setLocalPath(settings["storage_local_path"] ?? ""); }, [settings["storage_local_path"]]);
  const pathDirty = localPath !== (settings["storage_local_path"] ?? "");

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Dateispeicher</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Legt fest, wo hochgeladene Dateien (z. B. Fotos, Anhänge) gespeichert werden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Speicher-Backend</Label>
          <p className="text-xs text-slate-400 mt-0.5">
            „Replit Object Storage“ für den Betrieb im Replit-Workspace, „Lokale Festplatte“ für selbst gehostete Server.
          </p>
          <Select value={backend} onValueChange={(v) => onSave("storage_backend", v)}>
            <SelectTrigger className="text-sm max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gcs">Replit Object Storage</SelectItem>
              <SelectItem value="local">Lokale Festplatte</SelectItem>
            </SelectContent>
          </Select>
          {isSaving("storage_backend") && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>

        {backend === "local" && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Lokaler Speicherpfad</Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verzeichnis auf dem Server, in dem Dateien abgelegt werden (absoluter Pfad, z. B. /var/lib/comet-lkw/storage).
                  </p>
                </div>
                {pathDirty && (
                  <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={() => onSave("storage_local_path", localPath)} disabled={isSaving("storage_local_path")}>
                    {isSaving("storage_local_path") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                    Speichern
                  </Button>
                )}
              </div>
              <Input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/var/lib/comet-lkw/storage"
                className="text-sm"
              />
              <p className="text-xs text-amber-600 mt-1">
                Änderungen greifen für neue Anfragen innerhalb weniger Sekunden — ein Neustart des Servers ist nicht nötig. Bereits hochgeladene Dateien werden beim Wechsel des Backends nicht automatisch verschoben.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── LegalTextField ────────────────────────────────────────────────────────────

function LegalTextField({ settingKey, value, onSave, isSaving }: {
  settingKey: string; value: string;
  onSave: (key: string, val: string) => void; isSaving: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const dirty = local !== value;

  return (
    <div className="space-y-2">
      <RichTextEditor value={local} onChange={setLocal} placeholder="Text eingeben…" />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Wenn kein Text hinterlegt ist, wird ein Standard-Platzhalter mit Hinweis auf fehlende Angaben angezeigt.
        </p>
        <div className="flex items-center gap-2">
          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <Button
            size="sm"
            disabled={!dirty || isSaving}
            onClick={() => onSave(settingKey, local)}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" /> Speichern
          </Button>
        </div>
      </div>
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

// ── ReconciliationReminderDaysSetting ─────────────────────────────────────────

function ReconciliationReminderDaysSetting({
  settings,
  onSave,
  isSaving,
}: {
  settings: SettingsMap;
  onSave: (k: string, v: string) => void;
  isSaving: (k: string) => boolean;
}) {
  const stored = settings["reconciliation_reminder_days"] ?? "3";
  const [local, setLocal] = useState(stored);
  useEffect(() => { setLocal(settings["reconciliation_reminder_days"] ?? "3"); }, [settings]);
  const dirty = local !== stored;
  return (
    <div className="mt-4 space-y-1.5 border rounded-md p-3 bg-slate-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium text-slate-700">Erinnerung nach (Tage)</Label>
          <p className="text-xs text-slate-400 mt-0.5">
            Wie viele Tage nach Eröffnung der Abstimmung ohne Salden-Eintrag eine Erinnerung gesendet wird (Standard: 3)
          </p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 px-3 text-xs shrink-0"
            onClick={() => onSave("reconciliation_reminder_days", local)}
            disabled={isSaving("reconciliation_reminder_days")}
          >
            {isSaving("reconciliation_reminder_days") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        )}
      </div>
      <Input
        type="number"
        min={1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="3"
        className="text-sm w-32"
      />
    </div>
  );
}

// ── TabelleFelder ─────────────────────────────────────────────────────────────

function TabelleFelder({
  availableFields,
  settingKey,
  settings,
  defaultEnabledKeys,
}: {
  availableFields: { key: string; label: string }[];
  settingKey: string;
  settings: SettingsMap;
  defaultEnabledKeys?: string[] | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  function parseFields(): { key: string; label: string; enabled: boolean }[] {
    const raw = settings[settingKey];
    let enabledKeys: string[] | null = null;
    if (raw) {
      try { enabledKeys = JSON.parse(raw); } catch { /* ignore */ }
    }
    // Fall back to defaultEnabledKeys (for bulk) or all fields (for shipment)
    const fallback = defaultEnabledKeys ?? availableFields.map((f) => f.key);
    if (!enabledKeys) enabledKeys = fallback;
    const result: { key: string; label: string; enabled: boolean }[] = [];
    for (const k of enabledKeys) {
      const field = availableFields.find((f) => f.key === k);
      if (field) result.push({ ...field, enabled: true });
    }
    for (const f of availableFields) {
      if (!enabledKeys.includes(f.key)) result.push({ ...f, enabled: false });
    }
    return result;
  }

  const [fields, setFields] = useState(parseFields);

  useEffect(() => { setFields(parseFields()); }, [settings[settingKey]]);

  function toggle(key: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const arr = [...prev];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const enabledKeys = fields.filter((f) => f.enabled).map((f) => f.key);
      const res = await fetch(`${API}/settings/${settingKey}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(enabledKeys) }),
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Tabellenfelder gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-3.5 bg-slate-50/60 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Table2 className="w-3.5 h-3.5 text-slate-500" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Tabelle <span className="font-mono normal-case tracking-normal bg-slate-100 px-1 rounded text-slate-500">{"{{tabelle}}"}</span> — Felder &amp; Reihenfolge
          </p>
        </div>
        <Button size="sm" className="h-7 px-3 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
          Speichern
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">Haken setzen = Feld erscheint in der Tabelle. Reihenfolge mit ↑↓ ändern.</p>
      <div className="space-y-1">
        {fields.map((f, i) => (
          <div
            key={f.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors ${
              f.enabled ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100"
            }`}
          >
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={() => toggle(f.key)}
              className="h-3.5 w-3.5 accent-primary cursor-pointer"
            />
            <span className={`flex-1 text-xs font-medium ${f.enabled ? "text-slate-700" : "text-slate-400"}`}>
              {f.label}
            </span>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                title="Nach oben"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === fields.length - 1}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                title="Nach unten"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── EmailEventSection ─────────────────────────────────────────────────────────

function EmailEventSection({ eventKey, label, description, placeholders, recipientNote, tableFieldsKey, availableFields, defaultEnabledKeys, settings, onSave, isSaving }: {
  eventKey: string; label: string; description: string;
  placeholders: string[]; recipientNote: string | null;
  tableFieldsKey: string | null; availableFields: { key: string; label: string }[] | null;
  defaultEnabledKeys: string[] | null;
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

          {tableFieldsKey && availableFields && (
            <TabelleFelder
              availableFields={availableFields}
              settingKey={tableFieldsKey}
              settings={settings}
              defaultEnabledKeys={defaultEnabledKeys}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── EmailLog (Postausgang) ────────────────────────────────────────────────────

function EmailLogSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [preview, setPreview] = useState<EmailLogEntry | null>(null);
  const [resendEntry, setResendEntry] = useState<EmailLogEntry | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

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

  function openResend(entry: EmailLogEntry) {
    setResendEntry(entry);
    setResendEmail(user?.email ?? "");
  }

  async function handleResend() {
    if (!resendEntry || !resendEmail.trim()) return;
    setResendLoading(true);
    try {
      const res = await fetch(`${API}/email-log/${resendEntry.id}/resend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: resendEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler");
      }
      toast({ title: "E-Mail erneut gesendet", description: `An: ${resendEmail.trim()}` });
      setResendEntry(null);
    } catch (e: unknown) {
      toast({ title: "Fehler beim Senden", description: e instanceof Error ? e.message : "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  }

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
                        <div className="flex items-center gap-1">
                          {(entry.bodyHtml || entry.bodyText) && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreview(entry)}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Vorschau
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500 hover:text-primary" onClick={() => openResend(entry)}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Senden
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vorschau-Dialog */}
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

      {/* Erneut senden-Dialog */}
      <Dialog open={!!resendEntry} onOpenChange={(o) => !o && setResendEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              E-Mail erneut senden
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-md bg-slate-50 border px-3 py-2.5 space-y-1">
              <p className="text-xs text-slate-500 font-medium">Betreff</p>
              <p className="text-sm text-slate-800 truncate">{resendEntry?.subject}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Empfänger-E-Mail-Adresse</Label>
              <Input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="name@beispiel.de"
                className="text-sm"
                onKeyDown={(e) => { if (e.key === "Enter" && !resendLoading) handleResend(); }}
                autoFocus
              />
              <p className="text-xs text-slate-400">Die E-Mail wird mit dem Präfix [Weiterleitung] im Betreff gesendet.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setResendEntry(null)} disabled={resendLoading}>
                Abbrechen
              </Button>
              <Button size="sm" className="h-8 px-4 text-xs" onClick={handleResend}
                disabled={resendLoading || !resendEmail.trim()}>
                {resendLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                Jetzt senden
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── SMTP Settings Card ────────────────────────────────────────────────────────

function SmtpSettingsCard({ settings }: { settings: SettingsMap }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [host, setHost] = useState(settings["smtp_host"] ?? "");
  const [port, setPort] = useState(settings["smtp_port"] ?? "587");
  const [user, setUser] = useState(settings["smtp_user"] ?? "");
  const [pass, setPass] = useState(settings["smtp_pass"] ?? "");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHost(settings["smtp_host"] ?? "");
    setPort(settings["smtp_port"] ?? "587");
    setUser(settings["smtp_user"] ?? "");
    setPass(settings["smtp_pass"] ?? "");
  }, [settings]);

  const usingSendmail = !host.trim();

  async function handleSave() {
    setSaving(true);
    try {
      const pairs: [string, string][] = [
        ["smtp_host", host.trim()],
        ["smtp_port", port.trim() || "587"],
        ["smtp_user", user.trim()],
        ["smtp_pass", pass],
      ];
      const results = await Promise.all(
        pairs.map(([key, value]) =>
          fetch(`${API}/settings/${key}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error("Fehler");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "SMTP-Einstellungen gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">SMTP-Server</CardTitle>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${usingSendmail ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${usingSendmail ? "bg-emerald-500" : "bg-blue-500"}`} />
            {usingSendmail ? "Lokaler Mailserver (sendmail)" : "SMTP konfiguriert"}
          </div>
        </div>
        <CardDescription className="text-xs">
          Leer lassen = lokaler Mailserver wird verwendet (wie PHP&apos;s <code className="font-mono bg-slate-100 px-1 rounded">mail()</code>). SMTP-Daten angeben für externen Versand (z.&nbsp;B. Office 365, Gmail).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">SMTP-Host</Label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Leer = lokaler Mailserver"
              className="text-sm h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Port</Label>
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="587"
              className="text-sm h-8"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Benutzername</Label>
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="user@domain.de"
              className="text-sm h-8"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Passwort</Label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="text-sm h-8 pr-8"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Port 587 = STARTTLS · Port 465 = SSL/TLS · Leer lassen für lokalen Mailserver (funktioniert wenn Postfix/Sendmail auf dem Server läuft).
        </p>
        <div className="flex justify-end">
          <Button size="sm" className="h-8 px-4 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Wöchentlicher Bericht ─────────────────────────────────────────────────────

const WOCHENTAGE = [
  { value: "1", label: "Montag" },
  { value: "2", label: "Dienstag" },
  { value: "3", label: "Mittwoch" },
  { value: "4", label: "Donnerstag" },
  { value: "5", label: "Freitag" },
  { value: "6", label: "Samstag" },
  { value: "7", label: "Sonntag" },
];

const UHRZEITEN = Array.from({ length: 24 }, (_, h) => ({
  value: String(h).padStart(2, "0") + ":00",
  label: String(h).padStart(2, "0") + ":00 Uhr",
}));

function WeeklyReportCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: SettingsMap;
  onSave: (k: string, v: string) => void;
  isSaving: (k: string) => boolean;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const enabled = settings["report_weekly_enabled"] === "1";
  const email = settings["report_weekly_email"] ?? "";
  const day = settings["report_weekly_day"] ?? "1";
  const time = settings["report_weekly_time"] ?? "07:00";

  const [localEmail, setLocalEmail] = useState(email);
  useEffect(() => setLocalEmail(settings["report_weekly_email"] ?? ""), [settings]);

  async function handleSendNow() {
    setSending(true);
    try {
      const res = await fetch(`${API}/report/weekly/send`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Unbekannter Fehler");
      }
      toast({ title: "Bericht gesendet", description: "Der wöchentliche Bericht wurde erfolgreich versendet." });
    } catch (e) {
      toast({ title: "Fehler beim Senden", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Wöchentlicher Bericht</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Automatischer E-Mail-Bericht mit einer Zusammenfassung der letzten 7 Tage (Verladungen nach Status, LKW-Art und Spedition).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Aktiviert */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Aktiviert</label>
            <p className="text-xs text-slate-500 mt-0.5">Automatischen Bericht per E-Mail versenden</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onSave("report_weekly_enabled", v ? "1" : "")}
            disabled={isSaving("report_weekly_enabled")}
          />
        </div>

        <Separator />

        {/* Empfänger */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Empfänger-E-Mail(s)</Label>
          <p className="text-xs text-slate-500">Mehrere Adressen mit Komma trennen</p>
          <div className="flex gap-2">
            <Input
              value={localEmail}
              onChange={(e) => setLocalEmail(e.target.value)}
              placeholder="admin@firma.de, leitung@firma.de"
              className="text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave("report_weekly_email", localEmail)}
              disabled={isSaving("report_weekly_email") || localEmail === email}
            >
              {isSaving("report_weekly_email") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Wochentag + Uhrzeit */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Wochentag</Label>
            <Select value={day} onValueChange={(v) => onSave("report_weekly_day", v)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WOCHENTAGE.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Uhrzeit</Label>
            <Select value={time} onValueChange={(v) => onSave("report_weekly_time", v)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UHRZEITEN.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Jetzt senden */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Bericht jetzt senden</label>
            <p className="text-xs text-slate-500 mt-0.5">Sendet den Bericht sofort — unabhängig vom Zeitplan</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendNow}
            disabled={sending || !email.trim()}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Jetzt senden
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}

// ── PasswordExpiryCard ────────────────────────────────────────────────────────

function PasswordExpiryCard({
  settings,
  onSave,
  isSaving,
}: {
  settings: SettingsMap;
  onSave: (k: string, v: string) => void;
  isSaving: (k: string) => boolean;
}) {
  const expiryDays = settings["password_expiry_days"] ?? "90";
  const reminderDays = settings["password_expiry_reminder_days"] ?? "7,3,1";

  const [localExpiryDays, setLocalExpiryDays] = useState(expiryDays);
  const [localReminderDays, setLocalReminderDays] = useState(reminderDays);

  useEffect(() => setLocalExpiryDays(settings["password_expiry_days"] ?? "90"), [settings]);
  useEffect(() => setLocalReminderDays(settings["password_expiry_reminder_days"] ?? "7,3,1"), [settings]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Passwort-Ablauf</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Legt fest, wie lange Passwörter gültig sind und wann Benutzer per E-Mail an den bevorstehenden Ablauf erinnert werden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Gültigkeitsdauer (Tage)</Label>
          <p className="text-xs text-slate-500">Nach dieser Anzahl von Tagen muss das Passwort erneuert werden</p>
          <div className="flex gap-2 max-w-xs">
            <Input
              type="number"
              min={1}
              value={localExpiryDays}
              onChange={(e) => setLocalExpiryDays(e.target.value)}
              className="text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave("password_expiry_days", localExpiryDays)}
              disabled={isSaving("password_expiry_days") || localExpiryDays === expiryDays}
            >
              {isSaving("password_expiry_days") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Erinnerungs-Intervalle (Tage vor Ablauf)</Label>
          <p className="text-xs text-slate-500">Kommagetrennte Liste, z.B. 7,3,1 — sendet an diesen Tagen vor Ablauf jeweils eine Erinnerungs-E-Mail</p>
          <div className="flex gap-2 max-w-xs">
            <Input
              value={localReminderDays}
              onChange={(e) => setLocalReminderDays(e.target.value)}
              placeholder="7,3,1"
              className="text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSave("password_expiry_reminder_days", localReminderDays)}
              disabled={isSaving("password_expiry_reminder_days") || localReminderDays === reminderDays}
            >
              {isSaving("password_expiry_reminder_days") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <p className="text-xs text-amber-600">
          Der Text der Erinnerungs-E-Mail kann im Tab „E-Mail“ unter „Passwort läuft bald ab“ angepasst werden.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Push Template Settings ────────────────────────────────────────────────────

interface PushTemplateEntry {
  event_key: string;
  label: string;
  description: string;
  title_template: string;
  message_template: string;
  placeholders: string[];
}

function PushTemplateCard({ tpl, onSaved }: { tpl: PushTemplateEntry; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(tpl.title_template);
  const [message, setMessage] = useState(tpl.message_template);
  const [saving, setSaving] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setTitle(tpl.title_template); }, [tpl.title_template]);
  useEffect(() => { setMessage(tpl.message_template); }, [tpl.message_template]);

  const dirty = title !== tpl.title_template || message !== tpl.message_template;

  function insertPlaceholder(ph: string) {
    const el = messageRef.current;
    const token = `{${ph}}`;
    if (!el) { setMessage(m => m + token); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/push/message-templates/${tpl.event_key}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title_template: title, message_template: message }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Push-Vorlage gespeichert" });
      onSaved();
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{tpl.label}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{tpl.description}</CardDescription>
          </div>
          <Button size="sm" className="h-7 px-3 text-xs shrink-0" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            Speichern
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Titel</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} className="text-sm" placeholder="Push-Titel…" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Nachricht</Label>
          <Textarea
            ref={messageRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="text-sm resize-none"
            rows={2}
            placeholder="Nachrichtentext mit {platzhaltern}…"
          />
        </div>
        {tpl.placeholders.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Platzhalter — klicken zum Einfügen in die Nachricht:</p>
            <div className="flex flex-wrap gap-1">
              {tpl.placeholders.map(ph => (
                <button
                  key={ph}
                  type="button"
                  onClick={() => insertPlaceholder(ph)}
                  className="font-mono text-xs bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 px-2 py-0.5 rounded border border-slate-200 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  {`{${ph}}`}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-xs text-slate-400 mb-0.5">Vorschau:</p>
          <p className="text-xs font-semibold text-slate-700">{title || "—"}</p>
          <p className="text-xs text-slate-500">{message || "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PushTemplateSettings() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery<PushTemplateEntry[]>({
    queryKey: ["push-message-templates"],
    queryFn: async () => {
      const res = await fetch(`${API}/push/message-templates`, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  if (isLoading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">
          Titel und Nachrichtentext der Push-Benachrichtigungen anpassen. Platzhalter in geschweiften Klammern werden durch die jeweiligen Werte aus der Verladung ersetzt.
        </p>
      </div>
      {templates?.map(tpl => (
        <PushTemplateCard
          key={tpl.event_key}
          tpl={tpl}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["push-message-templates"] })}
        />
      ))}
    </div>
  );
}

// ── Server Restart ────────────────────────────────────────────────────────────

type RestartStatus = "idle" | "running" | "done" | "error";

// ── ChangelogManager ──────────────────────────────────────────────────────────

interface ChangelogEntry {
  id: number;
  title: string;
  bodyHtml: string;
  version: string | null;
  isPublished: boolean;
  publishedAt: string;
}

function formatChangelogDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ChangelogEntryDialog({ open, onOpenChange, entry, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: ChangelogEntry | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [publishedAt, setPublishedAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(entry?.title ?? "");
      setVersion(entry?.version ?? "");
      setBodyHtml(entry?.bodyHtml ?? "");
      setIsPublished(entry?.isPublished ?? true);
      setPublishedAt(entry ? entry.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    }
  }, [open, entry]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Titel darf nicht leer sein", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = entry ? `${API}/changelog/${entry.id}` : `${API}/changelog`;
      const method = entry ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          bodyHtml,
          version: version.trim() || null,
          isPublished,
          publishedAt: new Date(publishedAt).toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Speichern");
      }
      toast({ title: entry ? "Eintrag aktualisiert" : "Eintrag erstellt" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e?.message ?? "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Changelog-Eintrag bearbeiten" : "Neuer Changelog-Eintrag"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-sm font-medium">Titel</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Neue Funktion: Kalkulation" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Version (optional)</Label>
              <Input value={version} onChange={e => setVersion(e.target.value)} placeholder="1.2.0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Datum</Label>
              <Input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Sichtbarkeit</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
                <span className="text-sm text-slate-600 flex items-center gap-1">
                  {isPublished ? <><Globe className="w-3.5 h-3.5" /> Veröffentlicht</> : <><GlobeLock className="w-3.5 h-3.5" /> Entwurf</>}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Beschreibung</Label>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Was hat sich geändert?" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            <Save className="w-3.5 h-3.5 mr-1.5" /> Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangelogManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: entries, isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["changelog-admin"],
    queryFn: async () => {
      const res = await fetch(`${API}/changelog`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/changelog/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog-admin"] });
      toast({ title: "Eintrag gelöscht" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Löschen fehlgeschlagen", variant: "destructive" }),
  });

  const openNew = () => { setEditingEntry(null); setDialogOpen(true); };
  const openEdit = (entry: ChangelogEntry) => { setEditingEntry(entry); setDialogOpen(true); };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileClock className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Changelog</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              Öffentlich sichtbare Übersicht der Systemänderungen (auf der Login-Seite verlinkt).
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Neuer Eintrag
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Noch keine Changelog-Einträge vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-start justify-between gap-3 border rounded-lg p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900">{entry.title}</span>
                    {entry.version && <Badge variant="outline" className="text-xs">v{entry.version}</Badge>}
                    {entry.isPublished ? (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><Globe className="w-3 h-3 mr-1" />Veröffentlicht</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs"><GlobeLock className="w-3 h-3 mr-1" />Entwurf</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{formatChangelogDate(entry.publishedAt)}</p>
                  <div
                    className="prose prose-sm max-w-none mt-1.5 text-slate-600 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(entry)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => setDeleteId(entry.id)}>
                    <TrashIcon className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ChangelogEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editingEntry}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["changelog-admin"] })}
      />

      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eintrag löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ServerRestartCard() {
  const [status, setStatus] = useState<RestartStatus>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  function startRestart() {
    setConfirm(false);
    setLines([]);
    setStatus("running");

    const es = new EventSource(`${API}/admin/system/restart/stream`, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("log", (e) => {
      const { text } = JSON.parse(e.data);
      setLines(prev => [...prev, text]);
    });
    es.addEventListener("done", (e) => {
      const { text } = JSON.parse(e.data);
      setLines(prev => [...prev, text]);
      setStatus("done");
      es.close();
    });
    es.addEventListener("error", (e) => {
      try {
        const { text } = JSON.parse((e as MessageEvent).data);
        setLines(prev => [...prev, text]);
      } catch {
        setLines(prev => [...prev, "✗ Verbindung unterbrochen."]);
      }
      setStatus("error");
      es.close();
    });
  }

  function reset() {
    esRef.current?.close();
    setStatus("idle");
    setLines([]);
    setConfirm(false);
  }

  const statusColor: Record<RestartStatus, string> = {
    idle:    "text-slate-400",
    running: "text-amber-500",
    done:    "text-emerald-500",
    error:   "text-red-500",
  };
  const statusLabel: Record<RestartStatus, string> = {
    idle:    "Bereit",
    running: "Läuft…",
    done:    "Abgeschlossen",
    error:   "Fehler",
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-slate-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">API-Server neu starten</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Führt <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">sudo bash /opt/comet/app/update.sh</code> auf dem Server aus.
            </CardDescription>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${statusColor[status]}`}>
            {status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === "done" && <CheckCircle2 className="w-3 h-3" />}
            {status === "error" && <XCircle className="w-3 h-3" />}
            {statusLabel[status]}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Terminal output */}
        <div
          ref={termRef}
          className="bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 p-3 h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed"
        >
          {lines.length === 0 ? (
            <span className="text-slate-600">Ausgabe erscheint hier…</span>
          ) : (
            lines.map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith("✓") ? "text-emerald-400" :
                  line.startsWith("✗") ? "text-red-400" :
                  line.startsWith("▶") ? "text-amber-400" :
                  "text-slate-300"
                }
              >{line}</span>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!confirm && status !== "running" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setConfirm(true)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Server neu starten
            </Button>
          )}
          {confirm && (
            <>
              <span className="text-xs text-slate-500">Wirklich ausführen?</span>
              <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={startRestart}>
                Ja, jetzt starten
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfirm(false)}>
                Abbrechen
              </Button>
            </>
          )}
          {status === "running" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Läuft…
            </Button>
          )}
          {(status === "done" || status === "error") && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={reset}>
              <Terminal className="w-3.5 h-3.5 mr-1.5" />
              Zurücksetzen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── DesignSettingsCard ────────────────────────────────────────────────────────

const DESIGN_GROUPS: {
  title: string;
  description: string;
  fields: { key: string; label: string; placeholder: string }[];
}[] = [
  {
    title: "Buttons",
    description: "Standard-Buttons (z. B. „Neue Verladung“)",
    fields: [
      { key: "buttonBg", label: "Hintergrundfarbe", placeholder: "z.B. #1e293b" },
      { key: "buttonFg", label: "Textfarbe", placeholder: "z.B. #ffffff" },
      { key: "buttonRadius", label: "Eckenradius", placeholder: "z.B. 0.5rem" },
    ],
  },
  {
    title: "Tabellenkopf",
    description: "Kopfzeile der Tabellen (Spaltentitel)",
    fields: [
      { key: "tableHeaderBg", label: "Hintergrundfarbe", placeholder: "z.B. #f1f5f9" },
      { key: "tableHeaderFg", label: "Textfarbe", placeholder: "z.B. #64748b" },
    ],
  },
  {
    title: "Tabellenzeilen",
    description: "Zeilen innerhalb der Tabellen",
    fields: [
      { key: "tableRowHover", label: "Hover-Hintergrund", placeholder: "z.B. #f8fafc" },
      { key: "tableRowStripe", label: "Streifen (jede 2. Zeile)", placeholder: "leer = kein Streifen" },
    ],
  },
  {
    title: "Filter",
    description: "Filterleisten oberhalb von Listen (z. B. Verladungen)",
    fields: [
      { key: "filterBg", label: "Hintergrundfarbe", placeholder: "z.B. #ffffff" },
      { key: "filterBorder", label: "Rahmenfarbe", placeholder: "z.B. #e2e8f0" },
      { key: "filterRadius", label: "Eckenradius", placeholder: "z.B. 0.5rem" },
    ],
  },
  {
    title: "Cards",
    description: "Kartenelemente auf Dashboard und Einstellungsseiten",
    fields: [
      { key: "cardBg", label: "Hintergrundfarbe", placeholder: "z.B. #ffffff" },
      { key: "cardBorder", label: "Rahmenfarbe", placeholder: "z.B. #e2e8f0" },
      { key: "cardRadius", label: "Eckenradius", placeholder: "z.B. 0.75rem" },
    ],
  },
];

function toHex(value: string): string {
  const v = value.trim();
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v)) {
    if (v.length === 4) {
      return "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    }
    return v;
  }
  return "#000000";
}

function ColorField({ value, onChange, placeholder }: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7 shrink-0">
        <input
          type="color"
          value={toHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full cursor-pointer rounded border border-slate-200 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
          title="Farbe wählen"
        />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  );
}

const DEFAULT_TICKET_CATEGORIES = ["Verladung", "System", "Sonstiges"];

function TicketCategoriesCard({ settings, onSave, isSaving }: {
  settings: SettingsMap;
  onSave: (key: string, value: string) => void;
  isSaving: (key: string) => boolean;
}) {
  const parse = (raw: string | undefined) => {
    try { const p = JSON.parse(raw ?? ""); return Array.isArray(p) ? p : DEFAULT_TICKET_CATEGORIES; }
    catch { return DEFAULT_TICKET_CATEGORIES; }
  };
  const [categories, setCategories] = useState<string[]>(() => parse(settings.ticket_categories));
  const [newCat, setNewCat] = useState("");

  useEffect(() => { setCategories(parse(settings.ticket_categories)); }, [settings.ticket_categories]);

  function addCategory() {
    const t = newCat.trim();
    if (!t || categories.includes(t)) return;
    setCategories((prev) => [...prev, t]);
    setNewCat("");
  }

  function removeCategory(cat: string) {
    setCategories((prev) => prev.filter((c) => c !== cat));
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setCategories((prev) => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
  }

  function moveDown(idx: number) {
    if (idx === categories.length - 1) return;
    setCategories((prev) => { const n = [...prev]; [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]]; return n; });
  }

  const saving = isSaving("ticket_categories");

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Ticket-Kategorien</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Kategorien, die beim Erstellen eines Tickets zur Auswahl stehen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {categories.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4 border-2 border-dashed border-slate-200 rounded-md">
              Keine Kategorien — mindestens eine hinzufügen
            </p>
          )}
          {categories.map((cat, idx) => (
            <div key={cat} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5">
              <span className="flex-1 text-sm text-slate-800">{cat}</span>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" disabled={idx === 0} onClick={() => moveUp(idx)}>
                  <ChevronUp className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" disabled={idx === categories.length - 1} onClick={() => moveDown(idx)}>
                  <ChevronDown className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => removeCategory(cat)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Neue Kategorie…"
            className="h-8 text-sm"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={addCategory} disabled={!newCat.trim() || categories.includes(newCat.trim())}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Hinzufügen
          </Button>
        </div>
        <div className="flex justify-end pt-1">
          <Button
            size="sm" className="h-8 gap-1.5"
            disabled={saving || categories.length === 0}
            onClick={() => onSave("ticket_categories", JSON.stringify(categories))}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DesignSettingsCard({ settings, onSave, isSaving }: {
  settings: SettingsMap;
  onSave: (key: string, val: string) => void;
  isSaving: boolean;
}) {
  const { toast } = useToast();

  function parse(): Record<string, string> {
    const raw = settings["custom_design"];
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      return typeof obj === "object" && obj ? obj : {};
    } catch {
      return {};
    }
  }

  const saved = parse();
  const [values, setValues] = useState<Record<string, string>>(saved);
  useEffect(() => { setValues(parse()); }, [settings["custom_design"]]);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  function update(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function save() {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v && v.trim() !== "") cleaned[k] = v.trim();
    }
    onSave("custom_design", JSON.stringify(cleaned));
  }

  function resetAll() {
    setValues({});
    onSave("custom_design", JSON.stringify({}));
    toast({ title: "Design auf Standard zurückgesetzt" });
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Erscheinungsbild</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={resetAll} disabled={isSaving}>
              Alle zurücksetzen
            </Button>
            <Button size="sm" className="h-7 px-3 text-xs" onClick={save} disabled={!dirty || isSaving}>
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
              Speichern
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">
          Legt fest, wie Buttons, Tabellen, Filter und Cards im gesamten Programm aussehen — Änderungen gelten für alle Nutzer. Leer lassen = Standarddesign.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {DESIGN_GROUPS.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && <Separator className="mb-5" />}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">{group.title}</p>
                <p className="text-xs text-slate-400">{group.description}</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {group.fields.map((field) => {
                  const isRadius = /radius/i.test(field.key);
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">{field.label}</Label>
                      {isRadius ? (
                        <Input
                          value={values[field.key] ?? ""}
                          onChange={(e) => update(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="text-sm"
                        />
                      ) : (
                        <ColorField
                          value={values[field.key] ?? ""}
                          onChange={(val) => update(field.key, val)}
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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

  const { data: rolesData } = useQuery<{ roles: { roleKey: string; label: string; roleGroup: string; isSystem: boolean }[] }>({
    queryKey: ["admin-permissions-roles"],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/permissions`, { credentials: "include" });
      if (!res.ok) return { roles: [] };
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Einstellungen</h1>
        <p className="text-sm text-slate-500 mt-1">Globale Systemkonfiguration — nur für COMET-Admins sichtbar</p>
      </div>

      <Tabs defaultValue="allgemein" className="space-y-5">
        <TabsList className="flex flex-wrap h-auto w-full gap-1 justify-start p-1.5">
          <TabsTrigger value="allgemein" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Settings className="w-3.5 h-3.5 shrink-0" /> Allgemein
          </TabsTrigger>
          <TabsTrigger value="sidebar" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <PanelLeft className="w-3.5 h-3.5 shrink-0" /> Sidebar
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Mail className="w-3.5 h-3.5 shrink-0" /> E-Mail
          </TabsTrigger>
          <TabsTrigger value="push" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <BellRing className="w-3.5 h-3.5 shrink-0" /> Push-Texte
          </TabsTrigger>
          <TabsTrigger value="berichte" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <BarChart2 className="w-3.5 h-3.5 shrink-0" /> Berichte
          </TabsTrigger>
          <TabsTrigger value="sicherheit" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Sicherheit
          </TabsTrigger>
          <TabsTrigger value="postausgang" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Inbox className="w-3.5 h-3.5 shrink-0" /> Postausgang
          </TabsTrigger>
          <TabsTrigger value="rechtliches" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Scale className="w-3.5 h-3.5 shrink-0" /> Rechtliches
          </TabsTrigger>
          <TabsTrigger value="changelog" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <FileClock className="w-3.5 h-3.5 shrink-0" /> Changelog
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Server className="w-3.5 h-3.5 shrink-0" /> System
          </TabsTrigger>
          <TabsTrigger value="speicher" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <HardDrive className="w-3.5 h-3.5 shrink-0" /> Speicher
          </TabsTrigger>
          <TabsTrigger value="design" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Palette className="w-3.5 h-3.5 shrink-0" /> Design
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Tag className="w-3.5 h-3.5 shrink-0" /> Tickets
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

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Kalkulation</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Einstellungen für den Spediteur-Kostenvergleich
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fester Startort</label>
                <p className="text-xs text-slate-500">Wird auf der Kalkulations-Seite als Standard-Startpunkt vorausgefüllt (z.&thinsp;B. Firmenadresse oder Lagerstandort).</p>
                <KalkulationStartortField value={s["kalkulation_startort"] ?? ""} onSave={handleSave} isSaving={isSavingKey("kalkulation_startort")} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Sidebar ── */}
        <TabsContent value="sidebar" className="mt-0">
          <SidebarNavConfig savedConfig={s["sidebar_nav_config"] ?? ""} savedCategories={s["sidebar_categories"] ?? ""} savedOrder={s["sidebar_order"] ?? ""} savedRoleVisibility={s["sidebar_role_visibility"] ?? ""} roles={rolesData?.roles ?? []} />
        </TabsContent>

        {/* ── Tab: E-Mail-Vorlagen ── */}
        <TabsContent value="email" className="space-y-5 mt-0">

          {/* ── SMTP-Konfiguration ── */}
          <SmtpSettingsCard settings={s} />

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">E-Mail-Benachrichtigungen</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Automatische E-Mails bei bestimmten Ereignissen.
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
                    tableFieldsKey={ev.tableFieldsKey}
                    availableFields={ev.availableFields}
                    defaultEnabledKeys={ev.defaultEnabledKeys}
                    settings={s}
                    onSave={handleSave}
                    isSaving={isSavingKey}
                  />
                  {ev.key === "reconciliation_reminder" && (
                    <ReconciliationReminderDaysSetting settings={s} onSave={handleSave} isSaving={isSavingKey} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Push-Texte ── */}
        <TabsContent value="push" className="mt-0">
          <PushTemplateSettings />
        </TabsContent>

        {/* ── Tab: Rechtliches ── */}
        <TabsContent value="rechtliches" className="space-y-5 mt-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Impressum</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Inhalt der öffentlich zugänglichen Impressum-Seite (auf der Login-Seite verlinkt).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LegalTextField settingKey="impressum_text" value={s["impressum_text"] ?? ""} onSave={handleSave} isSaving={isSavingKey("impressum_text")} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Datenschutzerklärung</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Inhalt der öffentlich zugänglichen Datenschutz-Seite (auf der Login-Seite verlinkt).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LegalTextField settingKey="datenschutz_text" value={s["datenschutz_text"] ?? ""} onSave={handleSave} isSaving={isSavingKey("datenschutz_text")} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Changelog ── */}
        <TabsContent value="changelog" className="space-y-5 mt-0">
          <ChangelogManager />
        </TabsContent>

        {/* ── Tab: System ── */}
        <TabsContent value="system" className="mt-0">
          <ServerRestartCard />
        </TabsContent>

        {/* ── Tab: Speicher ── */}
        <TabsContent value="speicher" className="space-y-5 mt-0">
          <StorageSettingsCard settings={s} onSave={handleSave} isSaving={isSavingKey} />
        </TabsContent>

        {/* ── Tab: Design ── */}
        <TabsContent value="design" className="space-y-5 mt-0">
          <DesignSettingsCard settings={s} onSave={handleSave} isSaving={isSavingKey("custom_design")} />
        </TabsContent>

        {/* ── Tab: Berichte ── */}
        <TabsContent value="berichte" className="space-y-5 mt-0">
          <WeeklyReportCard settings={s} onSave={handleSave} isSaving={isSavingKey} />
        </TabsContent>

        {/* ── Tab: Sicherheit ── */}
        <TabsContent value="sicherheit" className="space-y-5 mt-0">
          <PasswordExpiryCard settings={s} onSave={handleSave} isSaving={isSavingKey} />
        </TabsContent>

        {/* ── Tab: Postausgang ── */}
        <TabsContent value="postausgang" className="mt-0">
          <EmailLogSection />
        </TabsContent>

        {/* ── Tab: Tickets ── */}
        <TabsContent value="tickets" className="space-y-5 mt-0">
          <TicketCategoriesCard settings={s} onSave={handleSave} isSaving={isSavingKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
