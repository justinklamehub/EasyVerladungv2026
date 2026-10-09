const DROP = "script,iframe,object,embed,base,link,meta,template,noscript,input[type='hidden'],foreignObject";
const PRIVATE = "[data-live-private],[data-testid*='chat'],[data-live-view-ui]";

/** Sanitizes at BOTH sender and viewer; the viewer never trusts a socket HTML payload. */
export function sanitizeSnapshot(root: HTMLElement) {
  root.querySelectorAll(DROP + "," + PRIVATE).forEach(node => node.remove());
  root.querySelectorAll("form").forEach(form => form.replaceWith(...Array.from(form.childNodes)));
  for (const node of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || ["href", "srcdoc", "action", "formaction", "nonce", "autofocus", "contenteditable", "srcset"].includes(name) ||
          (name.startsWith("data-") && !["data-testid", "data-live-scroll-top", "data-live-scroll-left"].includes(name))) {
        node.removeAttribute(attr.name);
      }
      if (["src", "poster", "xlink:href"].includes(name) && !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.setAttribute("readonly", "");
      const allowed = node instanceof HTMLInputElement && node.type !== "password" &&
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

export function captureSnapshot(): { html: string; page: string; width: number; height: number } {
  const page = window.location.pathname;
  if (/^\/(profil|users|settings|berechtigungen|chat)(\/|$)/.test(page)) {
    return { html: "<p style='padding:32px;font-family:sans-serif'>Kontoverwaltung und vertrauliche Einstellungen werden nicht übertragen.</p>", page, width: innerWidth, height: innerHeight };
  }
  const clone = document.body.cloneNode(true) as HTMLElement;
  const originals = Array.from(document.body.querySelectorAll("*"));
  const copies = Array.from(clone.querySelectorAll("*"));
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
  sanitizeSnapshot(clone);
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
  return { html: wrapper.outerHTML, page, width: innerWidth, height: innerHeight };
}

export function snapshotDocument(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  // Preserve CSS that the parser may move to head; never preserve any executable tags.
  parsed.querySelectorAll("style").forEach(style => container.appendChild(style.cloneNode(true)));
  container.append(...Array.from(parsed.body.childNodes));
  sanitizeSnapshot(container);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'`;
  // The sole allowed script is OUR constant scroll restoration, inside an opaque-origin sandbox.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body{margin:0;pointer-events:none}*{caret-color:transparent!important}</style></head><body>${container.innerHTML}<script nonce="${nonce}">document.querySelectorAll('[data-live-scroll-top],[data-live-scroll-left]').forEach(e=>{e.scrollTop=Math.min(10000000,Math.max(0,Number(e.dataset.liveScrollTop)||0));e.scrollLeft=Math.min(10000000,Math.max(0,Number(e.dataset.liveScrollLeft)||0));});</script></body></html>`;
}
