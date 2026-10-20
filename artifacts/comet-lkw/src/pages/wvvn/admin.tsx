import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCommitWvvnImport, usePreviewWvvnImport, useRevokeWvvnDevice, useSendWvvnReports, useUpdateWvvnArticle, useUpdateWvvnSettings,
  type WvvnArticle, type WvvnDevice, type WvvnEvent, type WvvnImportPreview, type WvvnReport, type WvvnSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODE_LABEL, downloadCsv, errMsg, fmtDateTime, useInvalidateWvvn } from "./lib";

const Box = ({ children }: { children: React.ReactNode }) => <div className="rounded-lg border bg-white p-4 space-y-3">{children}</div>;
const Msg = ({ ok, children }: { ok?: boolean; children: React.ReactNode }) => <div className={`rounded-md border p-2 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{children}</div>;

export function Articles({ articles, canEdit }: { articles: WvvnArticle[]; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<WvvnArticle | null>(null);
  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (t ? articles.filter((a) => [a.number, a.name, a.ean, a.veEan, a.legacyEan ?? "", a.legacyVeEan ?? ""].some((v) => v.toLowerCase().includes(t))) : articles).slice(0, 200);
  }, [articles, search]);
  return (
    <div className="space-y-3">
      <Input placeholder="Artikelnummer, Name, EAN oder VE-EAN suchen" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-article-search" />
      <p className="text-xs text-slate-500">Artikelstammdaten werden mit der Einlagerung geteilt; Änderungen wirken dort ebenfalls. Neue Artikel werden im Einlagerungs-Stamm angelegt. {articles.length} Artikel{list.length < articles.length && search === "" ? ", erste 200 angezeigt" : ""}.</p>
      {articles.some((a) => a.importNote) && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Bei {articles.filter((a) => a.importNote).length} Artikeln wurden abweichende oder mehrdeutige Altwerte nicht übernommen.
        Die Hinweise am Artikel zeigen die erhaltenen Originalwerte. Nicht eindeutige Codes erst nach fachlicher Prüfung zuordnen.
      </p>}
      {list.length === 0 ? <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Keine Artikel gefunden.</div> : (
        <div className="rounded-lg border bg-white overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>
          {["Nummer", "Name", "EAN", "VE-EAN", "VE-Faktor", "Aktiv", ""].map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{list.map((a) => <tr key={a.id} className="border-t" data-testid={`row-article-${a.id}`}><td className="px-3 py-2">{a.number}</td><td className="px-3 py-2">{a.name}{a.importNote && <div className="mt-1 text-xs text-amber-800">{a.importNote}</div>}</td><td className="px-3 py-2">{a.ean || "–"}</td><td className="px-3 py-2">{a.veEan || "–"}</td><td className="px-3 py-2">{a.veFactor}</td><td className="px-3 py-2">{a.active ? "Ja" : "Nein"}</td>
            <td className="px-3 py-2 text-right">{canEdit && <Button size="sm" variant="outline" onClick={() => setEdit(a)} data-testid={`button-edit-article-${a.id}`}>Bearbeiten</Button>}</td></tr>)}</tbody></table></div>
      )}
      {edit && <ArticleDialog a={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ArticleDialog({ a, onClose }: { a: WvvnArticle; onClose: () => void }) {
  const [f, setF] = useState({ number: a.number, name: a.name, ean: a.ean, veEan: a.veEan, veFactor: String(a.veFactor), active: a.active });
  const [err, setErr] = useState("");
  const m = useUpdateWvvnArticle();
  const inv = useInvalidateWvvn();
  const save = () => {
    const vf = Number(f.veFactor.replace(",", "."));
    if (!f.number.trim() || !(vf > 0 && vf <= 1000000)) { setErr("Nummer und VE-Faktor (> 0) sind erforderlich."); return; }
    setErr("");
    m.mutate({ id: a.id, data: { ...f, number: f.number.trim(), veFactor: vf, expectedUpdatedAt: a.updatedAt } }, { onSuccess: () => { inv(); onClose(); }, onError: (e) => setErr(errMsg(e)) });
  };
  const fld = (k: "number" | "name" | "ean" | "veEan" | "veFactor", l: string) => <div><Label>{l}</Label><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`input-article-${k}`} /></div>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
      <DialogHeader><DialogTitle>Artikel bearbeiten</DialogTitle></DialogHeader>
      <Msg ok>Geteilte Stammdaten: Die Änderung gilt auch in der Einlagerung.</Msg>
      {a.importNote && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{a.importNote}</p>}
      {fld("number", "Artikelnummer")}{fld("name", "Name")}{fld("ean", "EAN")}{fld("veEan", "VE-EAN")}{fld("veFactor", "VE-Faktor (Stück je VE)")}
      <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />Aktiv</label>
      {err && <Msg>{err}</Msg>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button disabled={m.isPending} onClick={save} data-testid="button-save-article">Speichern</Button></div>
    </DialogContent></Dialog>
  );
}

export function Devices({ devices, canRevoke }: { devices: WvvnDevice[]; canRevoke: boolean }) {
  const m = useRevokeWvvnDevice();
  const inv = useInvalidateWvvn();
  const [err, setErr] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Geräte werden im Scanner (/scanner/werksverkauf-vernichtung) von berechtigtem Personal freigegeben.</p>
      {err && <Msg>{err}</Msg>}
      {devices.length === 0 ? <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Keine freigegebenen Geräte.</div> : (
        <div className="rounded-lg border bg-white divide-y">{devices.map((d) => (
          <div key={d.id} className="p-3 flex flex-wrap items-center gap-2 text-sm" data-testid={`row-device-${d.id}`}>
            <b>{d.label}</b><span className="text-xs text-slate-500">freigegeben {fmtDateTime(d.createdAt)} · {d.revokedAt ? `widerrufen ${fmtDateTime(d.revokedAt)}` : d.expiresAt ? `gültig bis ${fmtDateTime(d.expiresAt)}` : "unbegrenzt"}</span>
            {canRevoke && !d.revokedAt && <Button size="sm" variant="outline" className="ml-auto" disabled={m.isPending} data-testid={`button-revoke-${d.id}`}
              onClick={() => { if (window.confirm(`Gerät „${d.label}" widerrufen?`)) { setErr(""); m.mutate({ id: d.id }, { onSuccess: inv, onError: (e) => setErr(errMsg(e)) }); } }}>Widerrufen</Button>}
          </div>))}</div>
      )}
    </div>
  );
}

export function Audit({ events }: { events: WvvnEvent[] }) {
  if (!events.length) return <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Keine Protokolleinträge.</div>;
  return <div className="rounded-lg border bg-white divide-y">{events.map((e) => <div key={e.id} className="p-3 text-sm"><b>{e.action}</b> · {e.actor} <span className="text-xs text-slate-500">{fmtDateTime(e.createdAt)}</span><div className="text-slate-600 break-words">{e.detail}</div></div>)}</div>;
}

export function Reports({ reports, canSend, canExport }: { reports: WvvnReport[]; canSend: boolean; canExport: boolean }) {
  const m = useSendWvvnReports();
  const inv = useInvalidateWvvn();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const send = () => {
    if (!window.confirm("Achtung: Es werden ECHTE E-Mails an die konfigurierten Empfänger versendet. Alle offenen Berichte jetzt senden?")) return;
    setMsg(null);
    m.mutate(undefined, { onSuccess: (r) => { setMsg({ ok: true, t: r.message }); inv(); }, onError: (e) => setMsg({ ok: false, t: errMsg(e) }) });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Berichte erfassen alle noch nicht gemeldeten, abgeschlossenen Listen (ohne Archiv) tagesübergreifend (automatisch: bis Ende des Vortags, nie der laufende Tag; manuell: bis jetzt), je Modus ein Bericht. Später abgeschlossene Listen folgen im nächsten Bericht. Automatisch höchstens einmal je Berliner Tag und Modus.</p>
      {canSend && <Button onClick={send} disabled={m.isPending} data-testid="button-send-reports">{m.isPending ? "Wird gesendet…" : "Offene Berichte jetzt senden / erneut versuchen"}</Button>}
      {msg && <Msg ok={msg.ok}>{msg.t}</Msg>}
      {reports.length === 0 ? <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">Noch keine Berichte.</div> : (
        <div className="rounded-lg border bg-white divide-y">{reports.map((r) => (
          <div key={r.id} className="p-3 flex flex-wrap items-center gap-2 text-sm" data-testid={`row-report-${r.id}`}>
            <b>{MODE_LABEL[r.mode]} · {r.reportDate} · Nr. {r.runningNo}</b>
            <span className="text-xs text-slate-600">Status: {r.status}{r.sentAt ? ` · gesendet ${fmtDateTime(r.sentAt)}` : ""}{r.legacy ? " · Archiv" : ""}</span>
            {r.error && <span className="text-xs text-red-700 w-full">{r.error}</span>}
            {canExport && <Button size="sm" variant="outline" className="ml-auto" disabled={r.legacy} title={r.legacy ? "Archivbericht ohne CSV" : undefined} data-testid={`button-report-csv-${r.id}`}
              onClick={() => { setMsg(null); downloadCsv(`reports/${r.id}/csv`, `wvvn-bericht-${r.id}.csv`).catch((e) => setMsg({ ok: false, t: errMsg(e) })); }}>CSV</Button>}
          </div>))}</div>
      )}
    </div>
  );
}

export function SettingsPanel({ settings }: { settings: WvvnSettings | null }) {
  const [d, setD] = useState<{ autoAddEan: boolean; defaultKware: boolean; hours: string; mailEnabled: boolean; mailTime: string; sales: string; destr: string } | null>(null);
  const init = useRef(false);
  const apply = (s: WvvnSettings) => setD({ autoAddEan: s.autoAddEan, defaultKware: s.defaultKware, hours: s.deviceHours == null ? "" : String(s.deviceHours), mailEnabled: s.mailEnabled, mailTime: s.mailTime, sales: s.salesRecipients, destr: s.destructionRecipients });
  useEffect(() => { if (settings && !init.current) { init.current = true; apply(settings); } }, [settings]);
  const m = useUpdateWvvnSettings();
  const inv = useInvalidateWvvn();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  if (!d) return <Msg>Einstellungen nicht verfügbar.</Msg>;
  const hasRcpt = [d.sales, d.destr].every((v) => v.split(/[;,\n]/).some((x) => x.trim()));
  const save = () => {
    const h = d.hours.trim() === "" ? null : Number(d.hours);
    if (h != null && !(Number.isInteger(h) && h >= 1 && h <= 8760)) { setMsg({ ok: false, t: "Gerätelaufzeit: 1–8760 Stunden oder leer (unbegrenzt)." }); return; }
    const bad = [d.sales, d.destr].flatMap((x) => x.split(";").map((e) => e.trim()).filter(Boolean)).find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) { setMsg({ ok: false, t: `Ungültige E-Mail-Adresse: ${bad}` }); return; }
    if (d.mailEnabled && !hasRcpt) { setMsg({ ok: false, t: "Bitte Empfänger für beide Vorgangsarten eintragen oder den Versand ausdrücklich deaktivieren." }); return; }
    setMsg(null);
    m.mutate({ data: { autoAddEan: true, defaultKware: true, deviceHours: h, mailEnabled: d.mailEnabled, mailTime: "00:00", salesRecipients: d.sales, destructionRecipients: d.destr } },
      { onSuccess: (r) => { apply(r); setMsg({ ok: true, t: "Gespeichert." }); inv(); }, onError: (e) => setMsg({ ok: false, t: errMsg(e) }) });
  };
  return (
    <Box>
            <div className="max-w-xs"><Label>Gerätelaufzeit (Stunden, leer = unbegrenzt)</Label><Input inputMode="numeric" value={d.hours} onChange={(e) => setD({ ...d, hours: e.target.value })} data-testid="input-device-hours" /></div>
      <label className="flex items-center gap-2 text-sm"><Switch disabled={!hasRcpt && !d.mailEnabled} checked={d.mailEnabled} onCheckedChange={(v) => setD({ ...d, mailEnabled: v })} data-testid="switch-mail" />Automatischer E-Mail-Bericht (Empfänger für beide Vorgangsarten erforderlich)</label>
      <div className="max-w-xs"><Label>Sendezeit (fest)</Label><Input value="00:00 Uhr Europe/Berlin" readOnly disabled data-testid="input-mail-time" /></div>
      <p className="text-xs text-slate-500">Der automatische Bericht (CSV je Modus) enthält die Listen des abgeschlossenen Vortags sowie ältere ungemeldete Listen, nie den laufenden Tag. Je Modus eigene Empfänger; dieselbe Adresse darf in beiden stehen.</p>
      <div><Label>Empfänger Werksverkauf (mit Semikolon trennen)</Label><Input value={d.sales} maxLength={2000} onChange={(e) => setD({ ...d, sales: e.target.value })} data-testid="input-sales-recipients" /></div>
      <div><Label>Empfänger Vernichtung (mit Semikolon trennen)</Label><Input value={d.destr} maxLength={2000} onChange={(e) => setD({ ...d, destr: e.target.value })} data-testid="input-destruction-recipients" /></div>
      <p className="text-xs text-slate-500">Um 00:00 Uhr werden die bis zum Tageswechsel abgeschlossenen Listen gemeldet. Abschlüsse des neuen Tages erscheinen erst in dessen Tagesabschluss. Der manuelle Versand berücksichtigt alle bislang ungemeldeten Abschlüsse bis jetzt. Altdaten werden nicht erneut automatisch versendet. Änderungen der Gerätelaufzeit gelten erst bei erneuter Freigabe.</p>
      {msg && <Msg ok={msg.ok}>{msg.t}</Msg>}
      <Button onClick={save} disabled={m.isPending} data-testid="button-save-settings">Einstellungen speichern</Button>
    </Box>
  );
}

export function ImportPanel() {
  const [sql, setSql] = useState("");
  const [name, setName] = useState("");
  const [pv, setPv] = useState<WvvnImportPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const prev = usePreviewWvvnImport();
  const commit = useCommitWvvnImport();
  const inv = useInvalidateWvvn();
  const onFile = async (f: File | undefined) => {
    setPv(null); setMsg(null); setSql(""); setName("");
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".sql")) { setMsg({ ok: false, t: "Nur .sql-Dateien sind erlaubt." }); return; }
    if (f.size > 20_000_000) { setMsg({ ok: false, t: "Datei größer als 20 MB." }); return; }
    try { setSql(await f.text()); setName(f.name); } catch (e) { setMsg({ ok: false, t: errMsg(e) }); }
  };
  const runPreview = () => prev.mutate({ data: { sql } }, { onSuccess: setPv, onError: (e) => setMsg({ ok: false, t: errMsg(e) }) });
  const runCommit = () => {
    if (!pv || pv.conflicts.length || !window.confirm("Import jetzt endgültig durchführen?")) return;
    commit.mutate({ data: { sql, previewHash: pv.previewHash } }, { onSuccess: () => { setMsg({ ok: true, t: "Import abgeschlossen." }); setPv(null); setSql(""); setName(""); inv(); }, onError: (e) => setMsg({ ok: false, t: errMsg(e) }) });
  };
  return (
    <Box>
      <p className="text-sm text-slate-600">Übernahme eines SQL-Exports der bisherigen Anwendung. Historische offene Listen bleiben Archiv und fließen nicht in neue Scans ein (Anzahl siehe Vorschau).</p>
      <input type="file" accept=".sql" onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-import-file" className="text-sm" />
      {name && <p className="text-xs text-slate-500">{name} geladen</p>}
      <Button variant="outline" disabled={!sql || prev.isPending} onClick={runPreview} data-testid="button-import-preview">Vorschau erstellen</Button>
      {msg && <Msg ok={msg.ok}>{msg.t}</Msg>}
      {pv && (
        <div className="space-y-2 text-sm" data-testid="panel-import-preview">
          <p>Artikel {pv.articles} · Listen {pv.sessions} · Positionen {pv.items} · Berichte {pv.reports} · Offene Archivlisten {pv.openSessions} (bleiben Archiv, nicht in neuen Scans)</p>
          {pv.alreadyImported && <Msg>Dieser Export wurde bereits importiert.</Msg>}
          {pv.conflicts.length > 0 && <Msg>Konflikte – Import gesperrt:<ul className="list-disc pl-5">{pv.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></Msg>}
          {pv.warnings.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">Warnungen:<ul className="list-disc pl-5">{pv.warnings.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
          <Button disabled={pv.conflicts.length > 0 || pv.alreadyImported || commit.isPending} onClick={runCommit} data-testid="button-import-commit">Import durchführen</Button>
        </div>
      )}
    </Box>
  );
}
