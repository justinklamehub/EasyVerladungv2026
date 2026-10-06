import { MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Rec } from "../lib";
import { P } from "../lib";

export function ShelfActionMenu({ shelf, has, onDetails, onAction, className = "" }: {
  shelf: Rec; has: (k: string) => boolean; onDetails: () => void; onAction: (s: Rec, full: boolean) => void; className?: string;
}) {
  const full = !!shelf.d.full;
  const name = String(shelf.d.name);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Aktionen für Regal ${name}`} data-testid={`shelf-menu-${shelf.id}`}
          className={`inline-flex items-center justify-center rounded text-current/80 hover:bg-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900 ${className}`}>
          <MoreVertical className="w-3.5 h-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails} data-testid={`menu-details-${shelf.id}`}>Details und Bestand</DropdownMenuItem>
        {!full && has(P.full) && <DropdownMenuItem onSelect={() => onAction(shelf, true)} data-testid={`menu-full-${shelf.id}`}>Regal voll melden</DropdownMenuItem>}
        {full && has(P.release) && <DropdownMenuItem onSelect={() => onAction(shelf, false)} data-testid={`menu-release-${shelf.id}`}>Regal freigeben</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
