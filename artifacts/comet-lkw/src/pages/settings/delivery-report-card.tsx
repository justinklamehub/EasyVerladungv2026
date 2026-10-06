import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { previewDeliveryReport, sendDeliveryReport, type DeliveryReportPreview } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_DELIVERY_MAIL_DAYS, DEFAULT_DELIVERY_MAIL_SUBJECT, DEFAULT_DELIVERY_MAIL_BODY, DELIVERY_MAIL_PLACEHOLDERS } from "@workspace/api-zod/delivery-mail";

export function DeliveryReportCard({ settings, onSave, isSaving, showTemplates = false }: {
  settings: Record<string, string>; onSave: (key: string, value: string) => Promise<unknown>; isSaving: (key: string) => boolean; showTemplates?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const enabled = settings.report_delivery_enabled === "1";
  const [email, setEmail] = useState(settings.report_delivery_email || "");
  const [time, setTime] = useState(settings.report_delivery_time || "07:00");
  const savedDays = settings.report_delivery_days ?? String(DEFAULT_DELIVERY_MAIL_DAYS);
  const savedSubject = settings.email_tpl_delivery_report_subject || DEFAULT_DELIVERY_MAIL_SUBJECT;
  const savedBody = settings.email_tpl_delivery_report_body || DEFAULT_DELIVERY_MAIL_BODY;
  const [days, setDays] = useState(savedDays);
  const [subject, setSubject] = useState(savedSubject);
  const [body, setBody] = useState(savedBody);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<DeliveryReportPreview | null>(null);
  useEffect(() => setEmail(settings.report_delivery_email || ""), [settings.report_delivery_email]);
  useEffect(() => setTime(settings.report_delivery_time || "07:00"), [settings.report_delivery_time]);
  useEffect(() => setDays(savedDays), [savedDays]);
  useEffect(() => setSubject(savedSubject), [savedSubject]);
  useEffect(() => setBody(savedBody), [savedBody]);
  const saving = ["enabled", "email", "time", "days"].some((k) => isSaving(`report_delivery_${k}`)) ||
    isSaving("email_tpl_delivery_report_subject") || isSaving("email_tpl_delivery_report_body");
  const validEmail = !!email.trim() && email.split(/[,;]/).map((v) => v.trim()).filter(Boolean).every((v) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v));
  const validDays = /^\d+$/.test(days.trim()) && Number(days) <= 3650;
  const templateDirty = subject !== savedSubject || body !== savedBody;
  const dirty = email.trim() !== (settings.report_delivery_email || "") || time !== (settings.report_delivery_time || "07:00") || days !== savedDays || templateDirty;
  let lastCheck: { at?: string; message?: string } = {};
  try { lastCheck = JSON.parse(settings.report_delivery_last_check || "{}"); } catch { /* Optional status is safe to omit. */ }
  const save = async (key: string, value: string) => {
    try {
      await onSave(key, value);
      if (key === "email_tpl_delivery_report_subject") setSubject(value || DEFAULT_DELIVERY_MAIL_SUBJECT);
      if (key === "email_tpl_delivery_report_body") setBody(value || DEFAULT_DELIVERY_MAIL_BODY);
    } catch { /* Parent shows save errors; keep the user's draft. */ }
  };
  const checkNow = async (send: boolean) => {
    setWorking(true);
    try {
      if (send) {
        const result = await sendDeliveryReport();
        toast({ title: result.sent ? "Liefertermin-Mail gesendet" : "Liefertermine geprüft", description: result.message });
        void qc.invalidateQueries({ queryKey: ["settings"] });
        void qc.invalidateQueries({ queryKey: ["email-log"] });
      } else setPreview(await previewDeliveryReport());
    } catch (error) {
      toast({ title: "Lieferterminprüfung fehlgeschlagen", description: error instanceof Error ? error.message : "Bitte Mailkonfiguration prüfen.", variant: "destructive" });
    } finally { setWorking(false); }
  };
  return <Card className="min-w-0" data-testid="card-delivery-report">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />Tägliche Lieferterminübersicht</CardTitle>
      <CardDescription>Täglich prüfen und bei Terminen innerhalb der eingestellten Mail-Frist oder überfälligen Terminen die gesamte aktuelle Übersicht senden.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="delivery-report-enabled">Automatische Liefertermin-Mail aktivieren</Label>
        <Switch id="delivery-report-enabled" checked={enabled} disabled={saving || working || (!enabled && (!settings.report_delivery_email?.trim() || dirty))}
          onCheckedChange={(v) => void save("report_delivery_enabled", v ? "1" : "0")} data-testid="switch-delivery-report-enabled" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="delivery-report-days">Tage vor Liefertermin</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="delivery-report-days" type="number" min={0} max={3650} step={1} value={days} onChange={(e) => setDays(e.target.value)}
            disabled={saving} className="w-36" data-testid="input-delivery-report-days" />
          <Button variant="outline" disabled={saving || !validDays || days === savedDays}
            onClick={() => void save("report_delivery_days", String(Number(days)))} data-testid="button-save-delivery-report-days">Tage speichern</Button>
        </div>
        <p className="text-xs text-slate-500">Frei einstellbar: 0 bis 3650 Kalendertage. 0 = am Liefertermin und bei überfälligen Terminen. Unabhängig von den Warnfarben der Lagerübersicht; bei KW zählt der Montag.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="delivery-report-email">Empfänger</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="delivery-report-email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving}
            placeholder="lager@example.de, leitung@example.de" className="min-w-0" data-testid="input-delivery-report-email" />
          <Button variant="outline" disabled={saving || !validEmail || email.trim() === (settings.report_delivery_email || "")}
            onClick={() => void save("report_delivery_email", email.trim())} data-testid="button-save-delivery-report-email">Empfänger speichern</Button>
        </div>
        <p className="text-xs text-slate-500">Mehrere Adressen mit Komma oder Semikolon trennen. Empfänger und Prüfzeit vor der Aktivierung speichern.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="delivery-report-time">Tägliche Prüfzeit (Europe/Berlin)</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="delivery-report-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={saving}
            className="w-36" data-testid="input-delivery-report-time" />
          <Button variant="outline" disabled={saving || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || time === (settings.report_delivery_time || "07:00")}
            onClick={() => void save("report_delivery_time", time)} data-testid="button-save-delivery-report-time">Uhrzeit speichern</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">Ab der Prüfzeit wird die eingestellte Mail-Frist geprüft, auch nach einem neuen Import. Höchstens eine Übersicht je Empfänger und Kalendertag. KW-Resttage beziehen sich auf den Montag; Plus-KW verlängert den Liefertermin nicht.</p>
      <p className="text-xs text-slate-500">Enthält Liefertermin/KW, Rest/Status, Regal, Spedition, Relation, Plus-KW, Palettenzahl und Importstand. Versand über die vorhandenen Mailserver-Einstellungen; Ergebnis im Postausgang.</p>
      {showTemplates ? <div className="space-y-4 border-t pt-4" data-testid="section-delivery-mail-template">
        <p className="text-sm font-semibold">Mailvorlage</p>
        <div className="space-y-2">
          <Label htmlFor="delivery-mail-subject">Betreff</Label>
          <Input id="delivery-mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} disabled={saving}
            data-testid="input-delivery-mail-subject" />
          <Button size="sm" variant="outline" disabled={saving || subject === savedSubject}
            onClick={() => void save("email_tpl_delivery_report_subject", subject)} data-testid="button-save-delivery-mail-subject">Betreff speichern</Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delivery-mail-body">E-Mail-Text</Label>
          <Textarea id="delivery-mail-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} disabled={saving}
            data-testid="input-delivery-mail-body" />
          <Button size="sm" variant="outline" disabled={saving || body === savedBody}
            onClick={() => void save("email_tpl_delivery_report_body", body)} data-testid="button-save-delivery-mail-body">Text speichern</Button>
        </div>
        <p className="text-xs text-slate-500">Leerer Betreff oder Text stellt die Standardvorlage wieder her. Die Übersichtstabelle wird automatisch angehängt, falls der Platzhalter fehlt.</p>
        <div className="flex flex-wrap gap-1">{DELIVERY_MAIL_PLACEHOLDERS.map((p) =>
          <Badge key={p} variant="secondary" className="max-w-full whitespace-normal break-all font-mono text-xs">{`{{${p}}}`}</Badge>)}</div>
      </div> : <p className="text-xs text-slate-500">Betreff und Nachrichtentext sind unter Einstellungen → E-Mail → Tägliche Lieferterminübersicht bearbeitbar.</p>}
      {lastCheck.at && <p className="text-xs text-slate-600" data-testid="text-delivery-report-last-check">
        Letzte Prüfung: {new Date(lastCheck.at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} – {lastCheck.message}
      </p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={working || saving || templateDirty || days !== savedDays} onClick={() => void checkNow(false)} data-testid="button-preview-delivery-report">Vorschau (ohne Versand)</Button>
        <Button disabled={working || saving || dirty || !settings.report_delivery_email?.trim()} onClick={() => void checkNow(true)}
          data-testid="button-send-delivery-report">{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Jetzt prüfen und ggf. senden</Button>
      </div>
      {(templateDirty || days !== savedDays) && <p className="text-xs text-amber-700">Änderungen zuerst speichern, dann Vorschau öffnen oder prüfen.</p>}
    </CardContent>
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent className="max-w-5xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Vorschau Liefertermin-Mail</DialogTitle><DialogDescription>
          {preview?.ordersCount} Auftragsgruppen, davon {preview?.dueCount} innerhalb der Mail-Frist von {preview?.warningDays} Tagen oder überfällig. Diese Vorschau versendet keine Mail.
        </DialogDescription></DialogHeader>
        <iframe title="Liefertermin-Mail-Vorschau" sandbox="" srcDoc={preview?.html} className="h-[60dvh] w-full rounded border" data-testid="iframe-delivery-report-preview" />
      </DialogContent>
    </Dialog>
  </Card>;
}
