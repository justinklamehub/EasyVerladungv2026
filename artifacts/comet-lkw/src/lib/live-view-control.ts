import { useEffect } from "react";

export interface LiveFilter {
  id: string; label: string; value: string; kind: "text" | "date" | "select";
  options?: { value: string; label: string }[];
}
export interface LiveSurface {
  page: string;
  navigation: { path: string; label: string }[];
  filters: LiveFilter[];
  scrollable: boolean;
}
export type LiveCommand =
  | { kind: "navigate"; page: string; path: string }
  | { kind: "filter"; page: string; id: string; value: string }
  | { kind: "scroll"; page: string; delta: number };
type RegisteredFilter = LiveFilter & { change: (value: string) => void };
const filters = new Map<string, RegisteredFilter>();
// Explicit read-only state callbacks, never DOM clicks, field guessing, or form submission.
export function useLiveFilters(values: RegisteredFilter[]) {
  useEffect(() => {
    for (const value of values) filters.set(value.id, value);
    return () => { for (const value of values) if (filters.get(value.id) === value) filters.delete(value.id); };
  }, [values]);
}
const SAFE_ROUTES = new Set([
  "/dashboard", "/shipments", "/shipments/kanban", "/paletten", "/abstimmungen",
  "/auditlog", "/wochenansicht", "/torbelegung", "/auswertung", "/auftragsauswertung",
  "/gefahrgut", "/fotos", "/hilfe", "/changelog", "/einlagerung", "/einlagerung/lagerplan",
  "/einlagerung/artikel", "/einlagerung/auftraege", "/einlagerung/vormerkungen",
  "/einlagerung/liefertermine",
]);
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export function controlPage() { return window.location.pathname.slice(base.length) || "/"; }
export function isPrivateControlPage(page: string) { return !SAFE_ROUTES.has(page); }
const PRIVATE = "[data-live-private],[data-live-view-ui],form,[role='dialog']";
export function readLiveSurface(): LiveSurface {
  const page = controlPage();
  if (isPrivateControlPage(page)) return { page, navigation: [], filters: [], scrollable: false };
  const navigation = new Map<string, string>();
  // These read-only landing pages are available to every signed-in role, also
  // when the mobile sidebar is closed and its links aren't mounted.
  for (const [path, label] of [
    ["/dashboard", "Dashboard"], ["/shipments", "Verladungen"], ["/paletten", "Paletten"],
    ["/abstimmungen", "Abstimmungen"], ["/wochenansicht", "Wochenansicht"],
    ["/torbelegung", "Torbelegung"], ["/hilfe", "Hilfe"], ["/changelog", "Änderungen"],
  ]) navigation.set(path!, label!);
  // Only destinations actually offered by the source's navigation are exposed.
  document.querySelectorAll<HTMLAnchorElement>("nav a[href]").forEach(link => {
    const url = new URL(link.href, window.location.origin);
    const path = url.pathname.slice(base.length);
    if (url.origin === window.location.origin && !url.search && !url.hash && SAFE_ROUTES.has(path)) {
      navigation.set(path, link.textContent?.trim().slice(0, 80) || path);
    }
  });
  return { page, navigation: [...navigation].map(([path, label]) => ({ path, label })),
    filters: [...filters.values()].slice(0, 20).map(({ change: _change, ...filter }) => filter),
    scrollable: !!document.querySelector("main") };
}
export function applyLiveCommand(command: LiveCommand, navigate: (path: string) => void) {
  if (document.hidden || !document.querySelector("[data-testid='live-view-source-banner']") ||
      command.page !== controlPage() || isPrivateControlPage(controlPage())) throw Error("Ansicht nicht mehr steuerbar.");
  if (command.kind !== "scroll" && document.querySelector("[role='dialog']:not([data-live-view-ui])")) {
    throw Error("Geöffnete Formulare müssen zuerst vom Benutzer geschlossen werden.");
  }
  if (command.kind === "navigate") {
    if (!readLiveSurface().navigation.some(link => link.path === command.path)) throw Error("Navigation nicht freigegeben.");
    navigate(command.path);
  } else if (command.kind === "filter") {
    const filter = filters.get(command.id);
    if (!filter || command.value.length > 200 ||
        (filter.kind === "select" && !filter.options?.some(option => option.value === command.value)) ||
        (filter.kind === "date" && command.value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(command.value))) {
      throw Error("Filter nicht freigegeben.");
    }
    filter.change(command.value);
  } else if (command.kind === "scroll") {
    // Scroll only content regions, never private overlays or chat.
    const main = document.querySelector<HTMLElement>("main");
    if (!main || !Number.isFinite(command.delta) || Math.abs(command.delta) > 800) throw Error("Scrollen nicht verfügbar.");
    const scrollable = [main, ...Array.from(main.querySelectorAll<HTMLElement>("*"))].find(element =>
      !element.closest(PRIVATE) && element.clientHeight > 50 && element.scrollHeight > element.clientHeight + 2 &&
      ["auto", "scroll"].includes(getComputedStyle(element).overflowY));
    (scrollable ?? main).scrollTop += command.delta;
  } else throw Error("Aktion nicht freigegeben.");
}
