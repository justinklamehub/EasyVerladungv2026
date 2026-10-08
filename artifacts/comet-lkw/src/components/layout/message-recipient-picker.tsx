import { useState } from "react";
import type { MessageRecipient } from "@workspace/api-client-react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterRecipients, RECIPIENT_ROLE_LABELS } from "./message-recipients";

export function MessageRecipientPicker({ users, selectedId, onSelect, loading, error, onRetry }: {
  users: MessageRecipient[]; selectedId: string; onSelect: (id: string) => void;
  loading: boolean; error: boolean; onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const matches = filterRecipients(users, search);
  const selected = users.find((u) => String(u.id) === selectedId);
  return (
    <div className="space-y-2">
      <Label htmlFor="message-recipient-search">Benutzer suchen und auswählen</Label>
      <Command shouldFilter={false} className="rounded-md border">
        <CommandInput id="message-recipient-search" aria-label="Benutzer suchen"
          placeholder="Benutzername, Spedition oder Rolle…" value={search} onValueChange={setSearch}
          data-testid="input-message-recipient-search" />
        <CommandList className="max-h-40 overscroll-contain" aria-label="Benutzervorschläge">
          {loading ? <div role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Benutzer werden geladen…
          </div> : error ? <div role="alert" className="space-y-2 p-3 text-sm">
            <p>Benutzer konnten nicht geladen werden.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>Erneut versuchen</Button>
          </div> : matches.length === 0 ? <p role="status" className="p-3 text-sm text-muted-foreground">
            {users.length ? "Keine passenden Benutzer gefunden." : "Keine Empfänger verfügbar."}
          </p> : matches.map((u) => (
            <CommandItem key={u.id} value={String(u.id)} onSelect={() => onSelect(String(u.id))}
              className="items-start py-2" data-testid={`message-recipient-${u.id}`}>
              <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${String(u.id) === selectedId ? "opacity-100" : "opacity-0"}`} />
              <span className="min-w-0">
                <span className="block break-words font-medium">{u.username}{!u.isActive ? " (inaktiv)" : ""}</span>
                <span className="block break-words text-xs text-muted-foreground">
                  {RECIPIENT_ROLE_LABELS[u.role] ?? u.role}{u.speditionName ? ` · ${u.speditionName}` : ""}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {!loading && !error && <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-xs text-muted-foreground" role="status">{matches.length} von {users.length} Benutzern · Pfeiltasten / Enter</p>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onRetry}>Liste aktualisieren</Button>
      </div>}
      {selected && <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm" data-testid="message-selected-recipient">
        <span className="min-w-0 break-words">Ausgewählt: <strong>{selected.username}</strong></span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onSelect("")} aria-label="Benutzerauswahl entfernen"><X className="h-4 w-4" /></Button>
      </div>}
    </div>
  );
}
