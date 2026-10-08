export const BUILD_QUERY = "__comet_build";

export async function fetchCurrentBuild(base: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${base}build-info.json?_=${Date.now()}`, {
    cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("Build-Prüfung nicht erreichbar");
  const info: unknown = await response.json();
  const buildId = (info as { buildId?: unknown } | null)?.buildId;
  if (typeof buildId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(buildId)) {
    throw new Error("Ungültige Build-Kennung");
  }
  return buildId;
}

export function reloadUrl(href: string, buildId: string): string {
  const url = new URL(href);
  url.searchParams.set(BUILD_QUERY, buildId);
  return url.href;
}

// Storage may be unavailable in private/kiosk mode: the URL is an independent
// loop guard. A stale proxy must not make us reload the same target repeatedly.
export function mayReload(href: string, target: string, previousTarget: string | null): boolean {
  return new URL(href).searchParams.get(BUILD_QUERY) !== target && previousTarget !== target;
}
