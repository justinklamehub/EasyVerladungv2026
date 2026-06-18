import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { PalletMovement } from "@workspace/api-client-react";

interface Props {
  movement: (PalletMovement & {
    palettenscheinnummer?: string | null;
    vonCometEuropaletten?: number;
    vonCometLadungssicherung?: number;
    vonDefektePaletten?: number;
    anCometEuropaletten?: number;
    anCometLadungssicherung?: number;
    anDefektePaletten?: number;
    palletFaktor?: number;
  }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_LABEL: Record<string, string> = {
  eingang: "Zugang",
  ausgang: "Abgang",
  korrektur: "Korrektur",
  abstimmung: "Abstimmung",
  neutral: "Neutral",
};

const TYPE_COLOR: Record<string, string> = {
  eingang: "bg-green-100 text-green-800 border-transparent",
  ausgang: "bg-red-100 text-red-800 border-transparent",
  korrektur: "bg-orange-100 text-orange-800 border-transparent",
  abstimmung: "bg-blue-100 text-blue-800 border-transparent",
  neutral: "bg-blue-100 text-blue-800 border-transparent",
};

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "" || value === 0) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-1.5">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-900 font-medium text-right">{value}</span>
    </div>
  );
}

function PalletBox({
  title,
  europaletten,
  ladungssicherung,
  defekt,
}: {
  title: string;
  europaletten?: number;
  ladungssicherung?: number;
  defekt?: number;
}) {
  const hasData = (europaletten ?? 0) > 0 || (ladungssicherung ?? 0) > 0 || (defekt ?? 0) > 0;
  return (
    <div className={`rounded-md border p-3 space-y-1 ${hasData ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-slate-50/50"}`}>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-slate-400">Europal.</div>
          <div className={`text-lg font-bold ${(europaletten ?? 0) > 0 ? "text-slate-800" : "text-slate-300"}`}>{europaletten ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Lasich.</div>
          <div className={`text-lg font-bold ${(ladungssicherung ?? 0) > 0 ? "text-slate-800" : "text-slate-300"}`}>{ladungssicherung ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-amber-500">Defekt</div>
          <div className={`text-lg font-bold ${(defekt ?? 0) > 0 ? "text-amber-600" : "text-slate-300"}`}>{defekt ?? 0}</div>
        </div>
      </div>
    </div>
  );
}

export function MovementDetailSheet({ movement, open, onOpenChange }: Props) {
  if (!movement) return null;

  const f = movement.palletFaktor ?? 1;
  // For neutral movements with factor > 1: compute factor-adjusted balance amount
  // anGross × f − vonGross (e.g. 100×3 − 300 = 0)
  const displayAmount = (movement.movementType === "neutral" && f > 1)
    ? Math.abs(
        ((movement.anCometEuropaletten ?? 0) + (movement.anCometLadungssicherung ?? 0)) * f
        - ((movement.vonCometEuropaletten ?? 0) + (movement.vonCometLadungssicherung ?? 0))
      )
    : (movement.amount ?? 0);

  const sign = movement.movementType === "ausgang" ? "-" : movement.movementType === "eingang" ? "+" : "";
  const amountColor = movement.movementType === "ausgang" ? "text-red-600" : "text-green-600";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-3">
            <Badge variant="outline" className={TYPE_COLOR[movement.movementType] ?? ""}>
              {TYPE_LABEL[movement.movementType] ?? movement.movementType}
            </Badge>
            <span className={`text-xl font-bold ${amountColor}`}>
              {sign}{displayAmount}
            </span>
          </SheetTitle>
          <p className="text-sm text-slate-500">
            {format(new Date(movement.movementDate), "EEEE, dd. MMMM yyyy", { locale: de })}
          </p>
        </SheetHeader>

        <div className="space-y-4">
          {/* Allgemein */}
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2">
            <DetailRow label="Spedition" value={movement.speditionName} />
            {movement.palettenscheinnummer && <Separator className="my-1" />}
            <DetailRow label="Palettenschein-Nr." value={movement.palettenscheinnummer} />
            {movement.shipmentBezeichnung && <Separator className="my-1" />}
            <DetailRow label="Verladung" value={movement.shipmentBezeichnung} />
            {movement.bemerkungen && <Separator className="my-1" />}
            <DetailRow label="Bemerkung" value={movement.bemerkungen} />
          </div>

          {/* Von COMET / An COMET */}
          {movement.movementType !== "abstimmung" && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Paletten</h4>
              <PalletBox
                title="Von COMET"
                europaletten={movement.vonCometEuropaletten}
                ladungssicherung={movement.vonCometLadungssicherung}
                defekt={movement.vonDefektePaletten}
              />
              <PalletBox
                title="An COMET"
                europaletten={movement.anCometEuropaletten}
                ladungssicherung={movement.anCometLadungssicherung}
                defekt={movement.anDefektePaletten}
              />
            </div>
          )}

          {/* Meta */}
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2">
            <DetailRow label="Erstellt von" value={movement.createdByName} />
            {movement.createdByName && <Separator className="my-1" />}
            <DetailRow
              label="Erstellt am"
              value={format(new Date(movement.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
            />
            <Separator className="my-1" />
            <DetailRow label="ID" value={`#${movement.id}`} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
