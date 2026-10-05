import { useRef, useState } from "react";
import { usePreviewEinlagerungImport, useCommitEinlagerungImport, useUpdateEinlagerungSettings } from "@workspace/api-client-react";
import type { EinlagerungImportInput, EinlagerungImportPreview, EinlagerungState } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SimpleSelect } from "./simple-select";
import { useRefreshEinlagerung } from "../use-einlagerung";
import { DATASET_LABELS, datasetOf, errMsg, nf, P } from "../lib";

type ImportType = EinlagerungImportInput["type"];

const FIELDS: Record<ImportType, { key: string; required?: boolean }[]> = {
  strategie: [{ key: "artikelnummer", required: true }, { key: "regal", required: true }, { key: "kundengruppe" }, { key: "prioritaet" }, { key: "hinweis" }],
  artikel: [{ key: "artikelnummer", required: true }, { key: "ean" }, { key: "artikelname" }],
  istbestand: [{ key: "typ" }, { key: "lagerplatz", required: true }, { key: "material", required: true }, { key: "b" }, { key: "dauer" }, { key: "charge" }, { key: "lagereinh", required: true }, { key: "bme" }, { key: "verfueg_bestand" }],
  retouren: [{ key: "debitor" }, { key: "name" }, { key: "parcours" }, { key: "hu", required: true }, { key: "platz", required: true }, { key: "kartons" }],
  auftraege: ["verkaufsbeleg", "lfdat", "plus_kw", "debitor", "kunde_name1", "plz", "beleg", "ern_ausl", "ret_klasse", "parkkennz", "handling_unit", "typ", "platz", "spediteur", "spediteur_name1", "relation", "q", "kartonanz"].map((key) => ({ key, required: key === "handling_unit" || key === "platz" })),
};
const TYPES = Object.keys(FIELDS) as ImportType[];
const DEFAULT = "default";

async function readFile(f: File) {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); }
}

export function ImportTab({ state, has }: { state: EinlagerungState; has: (k: string) => boolean }) {
  const [type, setType] = useState<ImportType>("strategie");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<EinlagerungImportPreview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const revision = useRef(0);
  const previewM = usePreviewEinlagerungImport();
  const commitM = useCommitEinlagerungImport();
  const settingsM = useUpdateEinlagerungSettings();
  const refresh = useRefreshEinlagerung();
  const { toast } = useToast();
  const canReplace = has(P.replace);

  const mapping = () => {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) if (v !== DEFAULT && v !== "") m[k] = Number(v);
    return m;
  };
  const input = (): EinlagerungImportInput => {
    const m = mapping();
    return { type, csv, filename, mode, mapping: m };
  };
  const reset = () => { revision.current++; setPreview(null); setConfirm(false); };

  const onFile = async (f?: File) => {
    if (!f) return;
    reset(); setCsv(""); setFilename(""); setHeaders([]);
    const current = revision.current;
    try {
      if (f.size > 35_000_000) throw new Error("Maximal 35 MB pro CSV-Datei.");
      const content = await readFile(f);
      if (current !== revision.current) return;
      setCsv(content); setFilename(f.name);
    } catch (e) {
      if (current === revision.current) toast({ title: "Datei konnte nicht gelesen werden", description: errMsg(e), variant: "destructive" });
    }
  };
  const runPreview = () => {
    const current = revision.current;
    previewM.mutate({ data: input() }, {
      onSuccess: (p) => { if (current === revision.current) { setPreview(p); setHeaders(p.headers); } },
      onError: (e) => { if (current === revision.current) toast({ title: "Vorschau fehlgeschlagen", description: errMsg(e), variant: "destructive" }); },
    });
  };
  const commit = () => commitM.mutate({ data: input() }, {
    onSuccess: (d) => { toast({ title: `${DATASET_LABELS[d.type] ?? d.type} importiert`, description: `${nf(d.rowCount)} Zeilen` }); setCsv(""); setFilename(""); reset(); refresh(); },
    onError: (e) => toast({ title: "Import fehlgeschlagen", description: errMsg(e), variant: "destructive" }),
  });
  const saveProfile = () => settingsM.mutate({ data: { ...state.settings, profiles: { ...state.settings.profiles, [type]: mapping() } } }, {
    onSuccess: () => { toast({ title: "Zuordnung als Profil gespeichert" }); refresh(); },
    onError: (e) => toast({ title: "Profil nicht gespeichert", description: errMsg(e), variant: "destructive" }),
  });
  const loadProfile = () => {
    const p = state.settings.profiles?.[type] as Record<string, number> | undefined;
    if (!p) { toast({ title: "Kein Profil für diesen Typ gespeichert" }); return; }
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) m[k] = String(v);
    setMap(m); reset();
  };

  const sampleKeys = preview?.sample?.[0] ? Object.keys(preview.sample[0]) : [];
  const canCommit = !!preview?.valid && !!csv && (mode === "merge" || (canReplace && confirm));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {TYPES.map((t) => {
          const d = datasetOf(state.datasets, t);
          return (
            <div key={t} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`dataset-${t}`}>
              <div className="text-xs uppercase tracking-wider text-slate-500">{DATASET_LABELS[t]}</div>
              {d ? (<><div className="text-sm font-semibold text-slate-900">{format(new Date(d.importedAt), "dd.MM.yyyy HH:mm")}</div><div className="text-xs text-slate-500">{nf(d.rowCount)} Zeilen, {d.importedBy}</div></>) : <div className="text-sm text-slate-400 mt-1">Nicht importiert</div>}
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Datentyp</Label><SimpleSelect value={type} onChange={(v) => { setType(v as ImportType); setMap({}); reset(); }} options={TYPES.map((t) => ({ value: t, label: DATASET_LABELS[t] }))} testId="select-import-type" /></div>
          <div className="space-y-1.5"><Label>Modus</Label><SimpleSelect value={mode} onChange={(v) => { setMode(v as "merge" | "replace"); reset(); }} options={[{ value: "merge", label: "Zusammenführen" }, ...(canReplace ? [{ value: "replace", label: "Ersetzen" }] : [])]} testId="select-import-mode" /></div>
          <div className="space-y-1.5"><Label>CSV-Datei</Label><Input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-import-file" /></div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-900">Spaltenzuordnung</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={loadProfile} data-testid="button-load-profile">Profil laden</Button>
            {has(P.settings) && <Button size="sm" variant="outline" onClick={saveProfile} disabled={settingsM.isPending} data-testid="button-save-profile">Als Profil speichern</Button>}
          </div>
          <p className="text-xs text-slate-500 mb-2">Standard nutzt die bisherige Spaltenposition. Spaltenauswahl erscheint nach der Vorschau.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {FIELDS[type].map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <Label className="w-36 shrink-0 text-xs font-mono">{f.key}{f.required && " *"}</Label>
                <SimpleSelect value={map[f.key] ?? DEFAULT} onChange={(v) => { setMap({ ...map, [f.key]: v }); reset(); }} testId={`map-${f.key}`}
                  options={[{ value: DEFAULT, label: "Standard" }, ...headers.map((h, i) => ({ value: String(i), label: `${i + 1}: ${h || "(leer)"}` }))]} />
              </div>
            ))}
          </div>
        </div>

        {mode === "replace" && (
          <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <Checkbox checked={confirm} onCheckedChange={(c) => setConfirm(!!c)} data-testid="checkbox-confirm-replace" />
            <span>Ich bestätige: Der bestehende Datensatz {DATASET_LABELS[type]} wird vollständig ersetzt.</span>
          </label>
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={!csv || previewM.isPending} onClick={runPreview} data-testid="button-import-preview">{previewM.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Vorschau</Button>
          <Button disabled={!canCommit || commitM.isPending} onClick={commit} data-testid="button-import-commit">{commitM.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Importieren</Button>
        </div>
      </section>

      {preview && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" data-testid="import-preview">
          <div className="text-sm"><span className={preview.valid ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{preview.valid ? "Gültig" : "Fehler gefunden"}</span> - {nf(preview.rowCount)} Zeilen erkannt</div>
          {preview.errors.length > 0 && <ul className="text-sm text-red-700 list-disc pl-5 space-y-0.5">{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {preview.warnings.length > 0 && <ul className="text-sm text-amber-700 list-disc pl-5 space-y-0.5">{preview.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {sampleKeys.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{sampleKeys.map((k) => <TableHead key={k} className="font-mono text-xs">{k}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{preview.sample.map((row, i) => <TableRow key={i}>{sampleKeys.map((k) => <TableCell key={k} className="text-xs">{String(row[k] ?? "")}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
