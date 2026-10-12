import { registerLiveFrame, isProtectedLiveElement } from "./live-view-direct";
import { controlPage } from "./live-view-control";
import { liveFrameBridge, type FrameBridgeOptions } from "./live-view-frame-bridge";
const DROP = "script,iframe,object,embed,base,link,meta,template,noscript,input[type='hidden'],foreignObject";
const PRIVATE = "[data-live-private],[data-testid*='chat'],[data-live-view-ui],[data-live-protected]";

/** Sanitizes at BOTH sender and viewer; the viewer never trusts a socket HTML payload. */
export function sanitizeSnapshot(root: HTMLElement, fullControl = false) {
  root.querySelectorAll(DROP + "," + PRIVATE).forEach(node => node.remove());
  root.querySelectorAll("form").forEach(form => {
    if (form.querySelector("input[type='password']")) form.remove();
    else form.replaceWith(...Array.from(form.childNodes));
  });
  for (const node of Array.from(root.querySelectorAll("*"))) {
    if (node instanceof HTMLElement && isProtectedLiveElement(node)) { node.remove(); continue; }
    // Default to read-only. Only our bridge re-enables registered targets
    // during an active full-control grant.
    if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      node.setAttribute("disabled", "");
      node.setAttribute("aria-disabled", "true");
      node.setAttribute("tabindex", "-1");
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || ["href", "srcdoc", "action", "formaction", "nonce", "autofocus", "contenteditable", "srcset"].includes(name) ||
          (name.startsWith("data-") && !["data-testid", "data-live-scroll-top", "data-live-scroll-left",
            "data-live-target", "data-live-actionable", "data-live-editable"].includes(name))) {
        node.removeAttribute(attr.name);
      }
      if (["src", "poster", "xlink:href"].includes(name) && !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.setAttribute("readonly", "");
      const allowed = (fullControl && node.hasAttribute("data-live-editable") &&
        (!(node instanceof HTMLInputElement) || node.type !== "password")) || node instanceof HTMLInputElement && node.type !== "password" &&
        (["date", "datetime-local", "month", "week", "time"].includes(node.type) ||
        /suche|suchen|filter|search/i.test([node.placeholder, node.getAttribute("aria-label"), node.getAttribute("data-testid"), node.type === "search" ? "search" : ""].join(" ")));
      if (!allowed && !["checkbox", "radio"].includes((node as HTMLInputElement).type)) {
        node.setAttribute("value", "");
        node.textContent = "";
        node.setAttribute("placeholder", "Eingabe geschützt");
      }
    }
  }
}

export function captureSnapshot(fullControl = false): { html: string; page: string; width: number; height: number; frameId: string; fullControl: boolean } {
  const page = controlPage();
  const frameId = crypto.randomUUID();
  if (/^\/(profil|users|settings|berechtigungen|chat)(\/|$)/.test(page)) {
    return { html: "<p style='padding:32px;font-family:sans-serif'>Kontoverwaltung und vertrauliche Einstellungen werden nicht übertragen.</p>", page, width: innerWidth, height: innerHeight, frameId, fullControl: false };
  }
  const clone = document.body.cloneNode(true) as HTMLElement;
  const originals = Array.from(document.body.querySelectorAll("*"));
  const copies = Array.from(clone.querySelectorAll("*"));
  registerLiveFrame(frameId, originals, copies);
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!copy) return;
    if (original instanceof HTMLElement && (original.scrollTop || original.scrollLeft)) {
      copy.setAttribute("data-live-scroll-top", String(original.scrollTop));
      copy.setAttribute("data-live-scroll-left", String(original.scrollLeft));
    }
    if (original instanceof HTMLInputElement) {
      copy.setAttribute("value", original.value);
      if (original.checked) copy.setAttribute("checked", "");
      else copy.removeAttribute("checked");
    }
    if (original instanceof HTMLTextAreaElement) copy.textContent = original.value;
    if (original instanceof HTMLOptionElement) {
      if (original.selected) copy.setAttribute("selected", "");
      else copy.removeAttribute("selected");
    }
    if (original instanceof HTMLImageElement && original.complete && original.naturalWidth > 0) {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 320 / original.naturalWidth);
        canvas.width = Math.max(1, Math.round(original.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(original.naturalHeight * scale));
        canvas.getContext("2d")?.drawImage(original, 0, 0, canvas.width, canvas.height);
        copy.setAttribute("src", canvas.toDataURL("image/webp", 0.65));
      } catch { copy.removeAttribute("src"); }
    }
    if (original instanceof HTMLCanvasElement) {
      // Canvas charts have no HTML representation; omit rather than expose an unmasked bitmap.
      copy.replaceWith(document.createTextNode("[Diagramm]"));
    }
  });
  sanitizeSnapshot(clone, fullControl);
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try { css += Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n"); } catch { /* foreign stylesheet omitted */ }
  }
  const style = document.createElement("style");
  style.textContent = css;
  clone.prepend(style);
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  const wrapper = document.createElement("div");
  wrapper.className = document.documentElement.className;
  wrapper.style.cssText = document.documentElement.style.cssText;
  wrapper.append(...Array.from(clone.childNodes));
  return { html: wrapper.outerHTML, page, width: innerWidth, height: innerHeight, frameId, fullControl };
}

export function snapshotBody(html: string, fullControl = false): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  // Preserve CSS that the parser may move to head; never preserve any executable tags.
  parsed.querySelectorAll("style").forEach(style => container.appendChild(style.cloneNode(true)));
  container.append(...Array.from(parsed.body.childNodes));
  sanitizeSnapshot(container, fullControl);
  return container.innerHTML;
}

export function snapshotDocument(html: string, options?: FrameBridgeOptions): string {
  const body = snapshotBody(html, options?.active === true);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'`;
  const config = JSON.stringify(options ?? { active: false }).replaceAll("<", "\\u003c");
  // Only OUR constant bridge executes; source DOM never supplies script or access to parent.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;pointer-events:${options?.active ? "auto" : "none"}}${options?.active ? "" : "*{caret-color:transparent!important}"}</style></head><body>${body}<script nonce="${nonce}">(${liveFrameBridge.toString()})(${config});</script></body></html>`;
}
