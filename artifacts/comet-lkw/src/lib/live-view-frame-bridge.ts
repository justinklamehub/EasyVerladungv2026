import type { LiveFocus } from "./live-view-direct";
export interface FrameBridgeOptions {
  token: string; frameId: string; page: string; active: boolean; focus?: LiveFocus;
}
/** Serialized as our sole nonce-authorized script, never taken from the source DOM. */
export function liveFrameBridge(config: FrameBridgeOptions) {
  const restoreScroll = () => document.querySelectorAll<HTMLElement>("[data-live-scroll-top],[data-live-scroll-left]").forEach(e => {
    e.scrollTop = Math.min(10000000, Math.max(0, Number(e.dataset.liveScrollTop) || 0));
    e.scrollLeft = Math.min(10000000, Math.max(0, Number(e.dataset.liveScrollLeft) || 0));
  });
  const enable = (root: ParentNode) => {
    if (!config.active) return;
    root.querySelectorAll<HTMLElement>("[data-live-actionable]").forEach(el => {
      el.removeAttribute("disabled"); el.removeAttribute("aria-disabled");
      if (el.dataset.liveEditable) el.removeAttribute("readonly");
      if (["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(el.tagName)) el.setAttribute("tabindex", "0");
    });
  };
  let lastEdit = 0;
  window.addEventListener("message", event => {
    const data = event.data;
    if (event.source !== parent || !data || data.channel !== "comet-live-frame" || data.token !== config.token ||
        typeof data.html !== "string" || data.html.length > 1500000 ||
        typeof data.frameId !== "string" || typeof data.page !== "string") return;
    const parsed = new DOMParser().parseFromString(data.html, "text/html");
    const fragment = document.createDocumentFragment();
    parsed.head.querySelectorAll("style").forEach(style => fragment.append(style));
    fragment.append(...Array.from(parsed.body.childNodes));
    const active = document.activeElement as HTMLInputElement | null;
    const replacement = active?.dataset.liveTarget && config.page === data.page ?
      Array.from(fragment.querySelectorAll<HTMLElement>("[data-live-target]")).find(el => el.dataset.liveTarget === active.dataset.liveTarget) : undefined;
    const start = active?.selectionStart;
    const end = active?.selectionEnd;
    if (replacement && active?.dataset.liveEditable) {
      // Preserve the actual input node: native key sequences/IME and browser automation
      // must not lose the field in the middle of a keystroke.
      const value = Date.now() - lastEdit < 1500 ? active.value : (replacement as HTMLInputElement).value;
      Array.from(active.attributes).forEach(attr => active.removeAttribute(attr.name));
      Array.from(replacement.attributes).forEach(attr => active.setAttribute(attr.name, attr.value));
      active.value = value;
      replacement.replaceWith(active);
    }
    config.frameId = data.frameId; config.page = data.page;
    enable(fragment);
    document.body.replaceChildren(fragment);
    restoreScroll();
    if (replacement && active?.dataset.liveEditable) {
      active.focus({ preventScroll: true });
      try { active.setSelectionRange(start ?? 0, end ?? start ?? 0); } catch { /* non-text field */ }
    }
  });
  restoreScroll();
  if (!config.active) return;
  const message = (command?: object, focus?: object) => parent.postMessage({
    channel: "comet-live-control", token: config.token, frameId: config.frameId, page: config.page, command, focus,
  }, "*");
  const element = (e: Event) => (e.target as Element | null)?.closest<HTMLElement>("[data-live-target][data-live-actionable]");
  const focus = (el: HTMLElement) => {
    const field = el as HTMLInputElement;
    return { target: el.dataset.liveTarget, value: el.dataset.liveEditable ? field.value : undefined,
      start: field.selectionStart ?? undefined, end: field.selectionEnd ?? undefined };
  };
  enable(document);
  // On snapshot replacement retain the operator's text and caret, not stale server echo.
  if (config.focus) {
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-live-target]"))
      .find(e => e.dataset.liveTarget === config.focus!.target);
    if (el?.dataset.liveActionable) {
      if (el.dataset.liveEditable && config.focus.value !== undefined) (el as HTMLInputElement).value = config.focus.value;
      el.focus({ preventScroll: true });
      try { (el as HTMLInputElement).setSelectionRange(config.focus.start ?? 0, config.focus.end ?? config.focus.start ?? 0); } catch { /* non-text field */ }
    }
  }
  document.addEventListener("focusin", e => { const el = element(e); if (el) message(undefined, focus(el)); });
  document.addEventListener("selectionchange", () => {
    const el = document.activeElement as HTMLElement | null;
    if (el?.dataset.liveEditable && el.dataset.liveTarget) message(undefined, focus(el));
  });
  document.addEventListener("click", e => {
    const el = element(e);
    if (!el) { e.preventDefault(); return; }
    // Text inputs must keep their native caret/default editing; never submit/navigate here.
    if (!el.dataset.liveEditable) e.preventDefault();
    message({ kind: "click", target: el.dataset.liveTarget }, focus(el));
  }, true);
  document.addEventListener("dblclick", e => { const el = element(e); if (el) message({ kind: "dblclick", target: el.dataset.liveTarget }); }, true);
  document.addEventListener("contextmenu", e => {
    e.preventDefault(); const el = element(e);
    if (el) message({ kind: "contextmenu", target: el.dataset.liveTarget });
  }, true);
  document.addEventListener("input", e => {
    const el = element(e);
    if (!el?.dataset.liveEditable) return;
    lastEdit = Date.now();
    const f = focus(el);
    message({ kind: "input", target: f.target, value: (el as HTMLInputElement).value, start: f.start, end: f.end }, f);
  });
  document.addEventListener("change", e => {
    const el = element(e);
    if (el?.tagName === "SELECT" && el.dataset.liveEditable) message({
      kind: "input", target: el.dataset.liveTarget, value: (el as HTMLSelectElement).value,
    }, focus(el));
  });
  document.addEventListener("keydown", e => {
    const el = element(e);
    if (!el || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", " "].includes(e.key)) return;
    if (el.dataset.liveEditable && (e.key === " " || (el.tagName === "TEXTAREA" && e.key === "Enter") ||
        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))) return;
    if (e.key !== "Tab") e.preventDefault();
    message({ kind: "key", target: el.dataset.liveTarget, key: e.key, shift: e.shiftKey }, focus(el));
  });
  let lastMove = 0;
  document.addEventListener("pointermove", e => {
    if (Date.now() - lastMove < 200) return;
    const el = element(e); if (!el) return;
    lastMove = Date.now();
    message({ kind: "mouse", target: el.dataset.liveTarget, x: e.clientX, y: e.clientY });
  });
  let wheelTimer = 0;
  let wheelTarget = "";
  let wheelX = 0;
  let wheelY = 0;
  document.addEventListener("wheel", e => {
    e.preventDefault(); const el = element(e); if (!el) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    wheelTarget = el.dataset.liveTarget!;
    wheelX += e.deltaX * unit; wheelY += e.deltaY * unit;
    if (wheelTimer) return;
    wheelTimer = window.setTimeout(() => {
      message({ kind: "wheel", target: wheelTarget,
        deltaX: Math.max(-1200, Math.min(1200, wheelX)), deltaY: Math.max(-1200, Math.min(1200, wheelY)) });
      wheelX = wheelY = wheelTimer = 0;
    }, 80);
  }, { passive: false });
}
