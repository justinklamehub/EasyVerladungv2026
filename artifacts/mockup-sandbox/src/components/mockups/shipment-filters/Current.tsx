import "./_group.css";
import {useState} from "react";
import {Input} from "./_ui/input";
import {Button} from "./_ui/button";
import {Checkbox} from "./_ui/checkbox";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "./_ui/select";
import {Popover,PopoverTrigger,PopoverContent} from "./_ui/popover";
import {Search,SlidersHorizontal,RotateCcw,GripVertical,X} from "lucide-react";
import {WorkViewsBar} from "./_work-views";
import {resolveWorkViewDates,type ShipmentWorkViewFilters,type WorkViewDate} from "./_model";
const STATUS_OPTIONS = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];
const WARE_STATUS_OPTIONS = ["nicht bereit", "vorbereitet", "ausgedruckt"];
const LKW_ART_OPTIONS = ["Container", "Anlieferung", "Abholung", "Sattelzug", "Wechselbrücke", "Sonstige"];
const TOR_OPTIONS = [...Array.from({ length: 18 }, (_, i) => `Tor ${i + 1}`), "Tor A", "Tor B", "Tor C"];

type SortField = "kennzeichen" | "etaDate" | "status" | "tor" | "speditionName";
type SortDir = "asc" | "desc";

type ColKey =
  | "id" | "kennzeichen" | "spedition" | "subspedition"
  | "art" | "relation" | "bezeichnung"
  | "eta" | "status" | "ware" | "tor"
  | "gesperrt" | "cometBearbeitet" | "telefon" | "bemerkungen"
  | "createdBy" | "createdAt" | "updatedBy" | "updatedAt";

const COLUMN_DEFS: { key: ColKey; label: string }[] = [
  { key: "id",              label: "ID" },
  { key: "kennzeichen",     label: "Kennzeichen" },
  { key: "spedition",       label: "Spedition" },
  { key: "subspedition",    label: "Sub-Spedition" },
  { key: "art",             label: "Art (LKW-Typ)" },
  { key: "relation",        label: "Relation" },
  { key: "bezeichnung",     label: "Bezeichnung" },
  { key: "eta",             label: "ETA / ATA" },
  { key: "status",          label: "Status" },
  { key: "ware",            label: "Ware" },
  { key: "tor",             label: "Tor" },
  { key: "gesperrt",        label: "Gesperrt" },
  { key: "cometBearbeitet", label: "COMET bearbeitet" },
  { key: "telefon",         label: "Telefon" },
  { key: "bemerkungen",     label: "Bemerkungen" },
  { key: "createdBy",       label: "Erstellt von" },
  { key: "createdAt",       label: "Erstellt am" },
  { key: "updatedBy",       label: "Aktualisiert von" },
  { key: "updatedAt",       label: "Aktualisiert am" },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  id: true,
  kennzeichen: true,
  spedition: true,
  subspedition: false,
  art: true,
  relation: true,
  bezeichnung: true,
  eta: true,
  status: true,
  ware: true,
  tor: true,
  gesperrt: false,
  cometBearbeitet: false,
  telefon: false,
  bemerkungen: false,
  createdBy: false,
  createdAt: false,
  updatedBy: false,
  updatedAt: false,
};

const DEFAULT_ORDER: ColKey[] = COLUMN_DEFS.map((c) => c.key);


export function Current(){
const user={id:0}; const isCometUser=true; const speditionen=[{id:1,name:"Beispiel-Spedition"}];
const [search,setSearch]=useState(""); const [filterStatus,setFilterStatus]=useState("__all__"); const [filterLkwArt,setFilterLkwArt]=useState("__all__"); const [filterTor,setFilterTor]=useState("__all__");const [filterSpeditionId,setFilterSpeditionId]=useState("__all__");
const [dateMode,setDateMode]=useState<WorkViewDate["mode"]>("today");const today=resolveWorkViewDates({mode:"today"}).from;const [filterDateFrom,setFilterDateFrom]=useState(today);const [filterDateTo,setFilterDateTo]=useState(today);const effectiveDates=resolveWorkViewDates(dateMode==="custom"?{mode:dateMode,from:filterDateFrom,to:filterDateTo}:{mode:dateMode});
const [showAbgefertigt,setShowAbgefertigt]=useState(false);const [showStorniert,setShowStorniert]=useState(false);
const workViewFilters={search,status:filterStatus,lkwArt:filterLkwArt,tor:filterTor,speditionId:filterSpeditionId,date:dateMode==="custom"?{mode:dateMode,from:filterDateFrom,to:filterDateTo}:{mode:dateMode},sortField:"etaDate",sortDir:"asc",showAbgefertigt,showStorniert} as ShipmentWorkViewFilters;
const [cols,setCols]=useState(DEFAULT_COLS);const colOrder=DEFAULT_ORDER;const hiddenCount=COLUMN_DEFS.filter(c=>!cols[c.key]).length;const hasActiveFilters=true;
const toggleCol=(key:ColKey)=>setCols(c=>({...c,[key]:!c[key]}));const resetCols=()=>setCols(DEFAULT_COLS);const handleDragStart=(_idx:number)=>undefined;const handleDragEnter=(_idx:number)=>undefined;const handleDragEnd=()=>undefined;const resetFilters=()=>{setSearch("");setFilterStatus("__all__");setFilterLkwArt("__all__");setFilterTor("__all__");setFilterSpeditionId("__all__");setDateMode("all");setShowAbgefertigt(false);setShowStorniert(false);};const applyWorkView=(_filters:ShipmentWorkViewFilters)=>undefined;
return (<div className="min-h-screen bg-slate-50 p-4">
      <div className="app-filter-bar p-4 border shadow-sm space-y-3">
        <WorkViewsBar key={user?.id} filters={workViewFilters} onApply={applyWorkView} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Kennzeichen, Tor…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterLkwArt} onValueChange={setFilterLkwArt}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="LKW-Art" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Arten</SelectItem>
              {LKW_ART_OPTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterTor} onValueChange={setFilterTor}>
            <SelectTrigger className="w-[110px]">
              <SelectValue placeholder="Tor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Tore</SelectItem>
              {TOR_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isCometUser && speditionen && (
            <Select value={filterSpeditionId} onValueChange={setFilterSpeditionId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Spedition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Speditionnen</SelectItem>
                {speditionen.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Column visibility picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 ml-auto">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Spalten
                {hiddenCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] leading-none px-1.5 py-0.5 rounded-full">
                    {hiddenCount} aus
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3">
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <span className="text-sm font-semibold text-slate-700">Sichtbare Spalten</span>
                {hiddenCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-slate-500 gap-1"
                    onClick={resetCols}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Alle
                  </Button>
                )}
              </div>
              <div className="space-y-0.5">
                {colOrder.map((key, idx) => {
                  const label = COLUMN_DEFS.find((c) => c.key === key)?.label ?? key;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragEnter={() => handleDragEnter(idx)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 select-none group"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 cursor-grab shrink-0" />
                      <Checkbox
                        checked={cols[key]}
                        onCheckedChange={() => toggleCol(key)}
                        className="shrink-0"
                      />
                      <span className="text-sm text-slate-700 cursor-pointer flex-1" onClick={() => toggleCol(key)}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Zeitraum:</span>
            <Select value={dateMode} onValueChange={(mode: WorkViewDate["mode"]) => {
              const dates = resolveWorkViewDates(mode === "custom"
                ? { mode, from: effectiveDates.from, to: effectiveDates.to } : { mode });
              setDateMode(mode);
              setFilterDateFrom(dates.from);
              setFilterDateTo(dates.to);
            }}>
              <SelectTrigger className="w-[160px] h-8" aria-label="ETA-Zeitraum" data-testid="shipment-date-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Heute</SelectItem>
                <SelectItem value="tomorrow">Morgen</SelectItem>
                <SelectItem value="thisWeek">Diese Woche</SelectItem>
                <SelectItem value="all">Alle Zeiträume</SelectItem>
                <SelectItem value="custom">Fester Zeitraum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>ETA von:</span>
            <Input
              type="date"
              className="w-[145px] h-8 text-sm"
              aria-label="ETA von"
              value={effectiveDates.from}
              onChange={(e) => { setDateMode("custom"); setFilterDateFrom(e.target.value); setFilterDateTo(effectiveDates.to); }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>bis:</span>
            <Input
              type="date"
              className="w-[145px] h-8 text-sm"
              aria-label="ETA bis"
              value={effectiveDates.to}
              onChange={(e) => { setDateMode("custom"); setFilterDateTo(e.target.value); setFilterDateFrom(effectiveDates.from); }}
            />
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-abgefertigt"
                checked={showAbgefertigt}
                onCheckedChange={(v) => setShowAbgefertigt(!!v)}
              />
              <label htmlFor="show-abgefertigt" className="text-sm text-slate-600 cursor-pointer select-none">
                Abgefertigte anzeigen
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-storniert"
                checked={showStorniert}
                onCheckedChange={(v) => setShowStorniert(!!v)}
              />
              <label htmlFor="show-storniert" className="text-sm text-slate-600 cursor-pointer select-none">
                Stornierte anzeigen
              </label>
            </div>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 h-8">
              <X className="w-3 h-3 mr-1" />
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

</div>);
}
