import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NAV_ICONS, NAV_ICON_NAMES } from "@/lib/nav-icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, GripVertical } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

// ── Default nav items (determines default order & fallbacks) ───────────────────

const DEFAULT_NAV_ITEMS: { href: string; defaultLabel: string; defaultIconName: string }[] = [
  { href: "/dashboard", defaultLabel: "Dashboard", defaultIconName: "LayoutDashboard" },
  { href: "/shipments", defaultLabel: "Verladungen", defaultIconName: "Truck" },
  { href: "/shipments/kanban", defaultLabel: "Kanban-Board", defaultIconName: "LayoutGrid" },
  { href: "/wochenansicht", defaultLabel: "Wochenplan", defaultIconName: "CalendarDays" },
  { href: "/speditionen", defaultLabel: "Speditionen", defaultIconName: "Building2" },
  { href: "/users", defaultLabel: "Benutzer", defaultIconName: "Users" },
  { href: "/paletten", defaultLabel: "Palettenkonto", defaultIconName: "PackageSearch" },
  { href: "/abstimmungen", defaultLabel: "Abstimmungen", defaultIconName: "FileCheck2" },
  { href: "/gefahrgut", defaultLabel: "Gefahrgut", defaultIconName: "ShieldAlert" },
  { href: "/auswertung", defaultLabel: "Auswertung", defaultIconName: "BarChart2" },
  { href: "/auditlog", defaultLabel: "Änderungslog", defaultIconName: "History" },
  { href: "/speditionsfreigabe", defaultLabel: "Speditionsfreigabe", defaultIconName: "Share2" },
  { href: "/settings", defaultLabel: "Einstellungen", defaultIconName: "Settings" },
  { href: "/berechtigungen", defaultLabel: "Berechtigungen", defaultIconName: "ShieldCheck" },
  { href: "/tickets", defaultLabel: "Tickets", defaultIconName: "TicketIcon" },
  { href: "/hilfe", defaultLabel: "Hilfe & Anleitung", defaultIconName: "HelpCircle" },
];

// ── Color palette ──────────────────────────────────────────────────────────────

const COLOR_PALETTE: { value: string; label: string }[] = [
  { value: "", label: "Standard (Primärfarbe)" },
  { value: "#ef4444", label: "Rot" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Gelb" },
  { value: "#22c55e", label: "Grün" },
  { value: "#14b8a6", label: "Türkis" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blau" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#a855f7", label: "Lila" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Grau" },
  { value: "#78716c", label: "Braun" },
  { value: "#dc2626", label: "Weinrot" },
  { value: "#0f172a", label: "Dunkelblau" },
];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NavItemOverride {
  href: string;
  label?: string;
  color?: string;
  iconName?: string;
}

interface NavItemState {
  href: string;
  defaultLabel: string;
  defaultIconName: string;
  label: string;
  color: string;
  iconName: string;
}

// ── Build initial state from saved JSON config ─────────────────────────────────

function buildInitialState(savedConfig: string): NavItemState[] {
  let overrides: NavItemOverride[] = [];
  try {
    if (savedConfig) overrides = JSON.parse(savedConfig);
  } catch {
    /* ignore corrupt data */
  }

  const overrideMap = new Map(overrides.map((o) => [o.href, o]));
  const remaining = new Set(DEFAULT_NAV_ITEMS.map((n) => n.href));
  const ordered: NavItemState[] = [];

  for (const override of overrides) {
    const def = DEFAULT_NAV_ITEMS.find((n) => n.href === override.href);
    if (def) {
      ordered.push({
        href: def.href,
        defaultLabel: def.defaultLabel,
        defaultIconName: def.defaultIconName,
        label: override.label ?? def.defaultLabel,
        color: override.color ?? "",
        iconName: override.iconName ?? def.defaultIconName,
      });
      remaining.delete(def.href);
    }
  }

  for (const def of DEFAULT_NAV_ITEMS) {
    if (remaining.has(def.href)) {
      ordered.push({
        href: def.href,
        defaultLabel: def.defaultLabel,
        defaultIconName: def.defaultIconName,
        label: def.defaultLabel,
        color: "",
        iconName: def.defaultIconName,
      });
    }
  }

  void overrideMap;
  return ordered;
}

// ── ColorPickerPopover ─────────────────────────────────────────────────────────

function ColorPickerPopover({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeColor = COLOR_PALETTE.find((c) => c.value === color);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Farbe auswählen"
          className="w-8 h-8 rounded-md border-2 border-slate-200 hover:border-slate-400 transition-colors shrink-0 flex items-center justify-center"
          style={color ? { backgroundColor: color, borderColor: color } : undefined}
        >
          {!color && (
            <div className="w-4 h-4 rounded-sm bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <p className="text-xs font-medium text-slate-600 mb-2">
          Farbe für aktiven Menüpunkt
          {activeColor && color && (
            <span className="ml-1 text-slate-400">({activeColor.label})</span>
          )}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.value || "default"}
              title={c.label}
              onClick={() => { onChange(c.value); setOpen(false); }}
              className={cn(
                "w-8 h-8 rounded-md transition-all hover:scale-110 border-2",
                color === c.value
                  ? "border-slate-700 scale-110"
                  : "border-transparent hover:border-slate-300"
              )}
              style={
                c.value
                  ? { backgroundColor: c.value }
                  : { background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)" }
              }
            >
              {!c.value && color === "" && (
                <span className="text-white text-[8px] font-bold leading-none">STD</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── IconPickerDialog ───────────────────────────────────────────────────────────

function IconPickerDialog({
  open,
  onClose,
  currentIconName,
  defaultIconName,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  currentIconName: string;
  defaultIconName: string;
  onSelect: (iconName: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = NAV_ICON_NAMES.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Icon auswählen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Icon suchen…"
            className="text-sm"
            autoFocus
          />
          <div className="grid grid-cols-6 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {filtered.map((name) => {
              const Icon = NAV_ICONS[name];
              const isSelected = name === currentIconName;
              const isDefault = name === defaultIconName;
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => { onSelect(name); onClose(); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg p-2 border transition-all hover:bg-slate-50",
                    isSelected
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-transparent text-slate-600 hover:border-slate-200"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] leading-none text-center text-slate-400 truncate w-full">
                    {isDefault ? (
                      <span className="text-emerald-600 font-medium">Standard</span>
                    ) : (
                      name
                    )}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-6 text-center text-sm text-slate-400 py-8">
                Kein Icon gefunden
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── SortableNavItem ────────────────────────────────────────────────────────────

function SortableNavItem({
  item,
  onLabelChange,
  onColorChange,
  onIconChange,
  onReset,
  onOpenIconPicker,
}: {
  item: NavItemState;
  onLabelChange: (href: string, label: string) => void;
  onColorChange: (href: string, color: string) => void;
  onIconChange: (href: string, iconName: string) => void;
  onReset: (href: string) => void;
  onOpenIconPicker: (href: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.href });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = NAV_ICONS[item.iconName] ?? NAV_ICONS[item.defaultIconName];
  const isCustomized =
    item.label !== item.defaultLabel ||
    item.color !== "" ||
    item.iconName !== item.defaultIconName;
  const activeColor = item.color || "#6366f1";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 transition-shadow",
        isDragging ? "shadow-xl border-primary/30 opacity-90 z-50" : "shadow-sm hover:shadow-md"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors shrink-0 touch-none"
        aria-label="Verschieben"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Icon preview — click to open icon picker */}
      <button
        onClick={() => onOpenIconPicker(item.href)}
        title="Icon ändern"
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
        style={{ backgroundColor: activeColor }}
      >
        {Icon && <Icon className="w-4 h-4 text-white" />}
      </button>

      {/* Label input */}
      <Input
        value={item.label}
        onChange={(e) => onLabelChange(item.href, e.target.value)}
        placeholder={item.defaultLabel}
        className="flex-1 h-8 text-sm min-w-0"
      />

      {/* Color picker */}
      <ColorPickerPopover
        color={item.color}
        onChange={(c) => onColorChange(item.href, c)}
      />

      {/* Reset button — only shown when customized */}
      <button
        onClick={() => onReset(item.href)}
        title="Zurücksetzen"
        className={cn(
          "shrink-0 p-1.5 rounded transition-all",
          isCustomized
            ? "text-slate-400 hover:text-red-500 hover:bg-red-50"
            : "text-slate-200 cursor-default"
        )}
        disabled={!isCustomized}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── SidebarNavConfig (main component) ─────────────────────────────────────────

export function SidebarNavConfig({ savedConfig }: { savedConfig: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<NavItemState[]>(() =>
    buildInitialState(savedConfig)
  );
  const [saving, setSaving] = useState(false);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

  useEffect(() => {
    setItems(buildInitialState(savedConfig));
  }, [savedConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.href === active.id);
      const newIndex = prev.findIndex((i) => i.href === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleLabelChange(href: string, label: string) {
    setItems((prev) =>
      prev.map((i) => (i.href === href ? { ...i, label } : i))
    );
  }

  function handleColorChange(href: string, color: string) {
    setItems((prev) =>
      prev.map((i) => (i.href === href ? { ...i, color } : i))
    );
  }

  function handleIconChange(href: string, iconName: string) {
    setItems((prev) =>
      prev.map((i) => (i.href === href ? { ...i, iconName } : i))
    );
  }

  function handleReset(href: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.href !== href) return i;
        return {
          ...i,
          label: i.defaultLabel,
          color: "",
          iconName: i.defaultIconName,
        };
      })
    );
  }

  function handleResetAll() {
    setItems(buildInitialState(""));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const overrides: NavItemOverride[] = items.map((i) => ({
        href: i.href,
        ...(i.label !== i.defaultLabel && { label: i.label }),
        ...(i.color && { color: i.color }),
        ...(i.iconName !== i.defaultIconName && { iconName: i.iconName }),
      }));

      const payload = JSON.stringify(overrides);
      const res = await fetch(`${API}/settings/sidebar_nav_config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: payload }),
      });
      if (!res.ok) throw new Error("Fehler");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["settings-public"] }),
      ]);
      toast({ title: "Sidebar-Konfiguration gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const iconPickerItem = items.find((i) => i.href === iconPickerFor);

  const anyCustomized = items.some(
    (i) =>
      i.label !== i.defaultLabel ||
      i.color !== "" ||
      i.iconName !== i.defaultIconName ||
      i.href !== DEFAULT_NAV_ITEMS[items.indexOf(i)]?.href
  );

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Sidebar-Navigation anpassen
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Reihenfolge per Drag &amp; Drop ändern · Beschriftung umbenennen · Farbe und Icon pro Eintrag wählen
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {anyCustomized && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-slate-500 hover:text-red-600"
                  onClick={handleResetAll}
                  disabled={saving}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Alles zurücksetzen
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}
                Speichern
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Column labels */}
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className="w-4" />
            <div className="w-8 text-[10px] text-slate-400 text-center">Icon</div>
            <div className="flex-1 text-[10px] text-slate-400">Beschriftung</div>
            <div className="w-8 text-[10px] text-slate-400 text-center">Farbe</div>
            <div className="w-7" />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.href)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {items.map((item) => (
                  <SortableNavItem
                    key={item.href}
                    item={item}
                    onLabelChange={handleLabelChange}
                    onColorChange={handleColorChange}
                    onIconChange={handleIconChange}
                    onReset={handleReset}
                    onOpenIconPicker={setIconPickerFor}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
            Die Reihenfolge und Anpassungen gelten für alle Benutzer.
            Rollenbasierte Zugriffsrechte bleiben unverändert — Menüpunkte, auf die ein Benutzer keinen Zugriff hat, werden weiterhin ausgeblendet.
          </p>
        </CardContent>
      </Card>

      {/* Icon picker dialog */}
      {iconPickerItem && (
        <IconPickerDialog
          open={iconPickerFor !== null}
          onClose={() => setIconPickerFor(null)}
          currentIconName={iconPickerItem.iconName}
          defaultIconName={iconPickerItem.defaultIconName}
          onSelect={(name) => {
            if (iconPickerFor) handleIconChange(iconPickerFor, name);
          }}
        />
      )}
    </>
  );
}
