import { BUILD_QUERY, fetchCurrentBuild, mayReload, reloadUrl } from "./app-build";

const KEY = "comet:build-reload-target";
const storage = {
  get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set: (value: string) => { try { sessionStorage.setItem(KEY, value); } catch { /* URL also guards reloads */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* optional storage */ } },
};

export async function startAppUpdates(buildId: string, base: string): Promise<boolean> {
  if (buildId === "development") return false;
  let dirty = false;
  let checking = false;
  let notice: HTMLElement | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  const markDirty = () => { dirty = true; };
  // A background resume must not destroy a partially filled form.
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  const reload = (target: string) => {
    if (!mayReload(location.href, target, storage.get())) return false;
    storage.set(target);
    location.replace(reloadUrl(location.href, target));
    return true;
  };
  const showUpdate = (target: string, blocked = false) => {
    if (notice) return;
    notice = document.createElement("aside");
    notice.setAttribute("role", "alert");
    notice.setAttribute("data-testid", "app-update-notice");
    notice.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:10000;padding:12px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;border:1px solid hsl(var(--border));border-radius:8px;background:hsl(var(--background));color:hsl(var(--foreground));box-shadow:0 3px 14px #0003;font:14px sans-serif";
    const text = document.createElement("span");
    text.textContent = blocked
      ? "Eine neue Version ist verfügbar, der Server liefert aber noch den alten App-Stand. Bitte später erneut versuchen."
      : "Neue App-Version verfügbar. Bitte begonnene Eingaben speichern und anschließend aktualisieren.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Jetzt aktualisieren";
    button.style.cssText = "border:1px solid currentColor;border-radius:6px;padding:6px 10px;cursor:pointer";
    button.onclick = () => {
      if (dirty && !window.confirm("Neu laden? Nicht gespeicherte Eingaben gehen dabei verloren.")) return;
      storage.clear();
      location.replace(reloadUrl(location.href, target));
    };
    notice.append(text, button);
    document.body.append(notice);
  };
  const check = async (startup: boolean) => {
    if (checking || (!startup && document.visibilityState !== "visible")) return false;
    checking = true;
    try {
      const latest = await fetchCurrentBuild(base);
      if (latest === buildId) {
        storage.clear();
        const url = new URL(location.href);
        if (url.searchParams.has(BUILD_QUERY)) {
          url.searchParams.delete(BUILD_QUERY);
          history.replaceState(history.state, "", url);
        }
        notice?.remove(); notice = null;
        return false;
      }
      notice?.remove(); notice = null;
      const busy = dirty || !!document.querySelector('[role="dialog"], [role="alertdialog"]') || !!document.activeElement?.closest("input, textarea, [contenteditable=true]");
      if ((startup || !busy) && reload(latest)) return true;
      showUpdate(latest, !mayReload(location.href, latest, storage.get()));
    } catch (err) {
      // Offline/unavailable is not evidence of a new release. Keep the loaded app
      // usable and retry on the next resume/online event, without forced reloads.
      console.warn("App-Build konnte nicht geprüft werden.", err);
      if (!notice) {
        notice = document.createElement("aside");
        notice.setAttribute("role", "status");
        notice.style.cssText = "position:fixed;bottom:8px;left:8px;right:8px;z-index:10000;padding:12px;border:1px solid hsl(var(--border));border-radius:8px;background:hsl(var(--background));color:hsl(var(--foreground));font:14px sans-serif";
        const text = document.createElement("span");
        text.textContent = "App-Version konnte nicht geprüft werden. Verbindung prüfen. ";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Erneut prüfen";
        retry.style.cssText = "text-decoration:underline;cursor:pointer";
        retry.onclick = () => { void check(false); };
        notice.append(text, retry);
        document.body.append(notice);
      }
    } finally { checking = false; }
    return false;
  };

  if (await check(true)) return true;
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" })
      .then((reg) => { registration = reg; return reg.update(); })
      .catch((err) => console.warn("Service-Worker-Aktualisierung fehlgeschlagen.", err));
  }
  const resume = () => {
    if (document.visibilityState !== "visible") return;
    void registration?.update().catch((err) => console.warn("Service-Worker-Prüfung fehlgeschlagen.", err));
    void check(false);
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  return false;
}
