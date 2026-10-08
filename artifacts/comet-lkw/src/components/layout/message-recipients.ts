export const RECIPIENT_ROLE_LABELS: Record<string, string> = {
  comet_admin: "COMET Admin",
  comet_leitstand: "COMET Leitstand",
  comet_lager: "COMET Lager",
  comet_viewer: "COMET Betrachter",
  speditions_admin: "Speditions-Admin",
  speditions_bearbeiter: "Speditions-Bearbeiter",
  speditions_viewer: "Speditions-Betrachter",
  speditions_fahrer: "Speditions-Fahrer",
};

export type SearchableRecipient = {
  id: number; username: string; role: string; speditionName: string | null; isActive: boolean;
};
const normalize = (s: string) => s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("de");

export function filterRecipients<T extends SearchableRecipient>(users: readonly T[], query: string): T[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return users.filter((u) => {
    const haystack = normalize(`${u.username} ${u.speditionName ?? ""} ${u.role} ${RECIPIENT_ROLE_LABELS[u.role] ?? ""}`);
    return words.every((word) => haystack.includes(word));
  }).sort((a, b) => a.username.localeCompare(b.username, "de", { numeric: true, sensitivity: "base" }) || a.id - b.id);
}
