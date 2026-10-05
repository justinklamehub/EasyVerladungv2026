import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { EinlagerungRecord, EinlagerungState, EinlagerungDataset } from "@workspace/api-client-react";
import { PERMISSIONS_QUERY_KEY } from "@/hooks/use-permissions";
import { useAuth } from "@/contexts/auth-context";

export const P = {
  view: "einlagerung.view",
  scan: "einlagerung.scan",
  full: "einlagerung.full",
  release: "einlagerung.release",
  resCreate: "einlagerung.reservation.create",
  resEdit: "einlagerung.reservation.edit",
  strategy: "einlagerung.strategy",
  master: "einlagerung.master",
  import: "einlagerung.import",
  replace: "einlagerung.replace",
  settings: "einlagerung.settings",
} as const;

export const ALL_KEYS: string[] = Object.values(P);

export function hasEinlagerungAccess(isAdmin: boolean, perms: Record<string, boolean>) {
  return isAdmin || ALL_KEYS.some((k) => !!perms[k]);
}

export function useEinlagerungAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const q = useQuery<Record<string, boolean>>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: () => customFetch("/api/auth/permissions"),
    staleTime: 60_000,
    enabled: !!user,
  });
  const perms = q.data ?? {};
  const admin = user?.role === "comet_admin";
  const has = (k: string) => admin || !!perms[k];
  return { isLoading: authLoading || q.isLoading, user, has, any: hasEinlagerungAccess(admin, perms) };
}

export type D = Record<string, any>;
export interface Rec { id: number; kind: string; updatedAt: string; d: D }

export function toRec(r: EinlagerungRecord): Rec {
  return { id: r.id, kind: r.kind, updatedAt: r.updatedAt, d: r.data as D };
}

const cmp = (a: Rec, b: Rec) =>
  (Number(a.d.sort ?? 0) - Number(b.d.sort ?? 0)) ||
  String(a.d.name ?? a.d.number ?? "").localeCompare(String(b.d.name ?? b.d.number ?? ""), "de", { numeric: true });

export function useModel(state?: EinlagerungState) {
  return useMemo(() => {
    const all = (state?.records ?? []).map(toRec);
    const by = (k: string) => all.filter((r) => r.kind === k).sort(cmp);
    const halls = by("hall"), aisles = by("aisle"), shelves = by("shelf"), articles = by("article");
    const groups = by("group"), rules = by("rule"), reservations = by("reservation"), carriers = by("carrier");
    const map = (l: Rec[]) => new Map(l.map((r) => [r.id, r]));
    const hallById = map(halls), aisleById = map(aisles), shelfById = map(shelves);
    const articleById = map(articles), groupById = map(groups);
    const spedName = (id: unknown) => state?.speditionen.find((s) => s.id === Number(id))?.name ?? "";
    const shelfLabel = (s?: Rec) => {
      if (!s) return "";
      const a = aisleById.get(Number(s.d.aisleId));
      const h = a ? hallById.get(Number(a.d.hallId)) : undefined;
      return [h?.d.name, a?.d.name, s.d.name].filter(Boolean).join(" / ");
    };
    return { halls, aisles, shelves, articles, groups, rules, reservations, carriers, hallById, aisleById, shelfById, articleById, groupById, spedName, shelfLabel };
  }, [state]);
}
export type Model = ReturnType<typeof useModel>;

export function datasetOf(datasets: EinlagerungDataset[] | undefined, type: string) {
  const l = (datasets ?? []).filter((d) => d.type === type);
  l.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
  return l[0] as EinlagerungDataset | undefined;
}

export const DATASET_LABELS: Record<string, string> = {
  strategie: "Strategie", istbestand: "IST-Bestand", retouren: "Retouren", auftraege: "Aufträge", artikel: "Artikel",
};

export function errMsg(e: unknown): string {
  const x = e as any;
  return x?.data?.error || x?.response?.data?.error || x?.message || "Unbekannter Fehler";
}

export const nf = (n: number) => new Intl.NumberFormat("de-DE").format(n);
export const sumPal = (l: D[]) => l.reduce((s, x) => s + (Number(x.paletten) || 0), 0);
