import { controlPage } from "./live-view-control";

export type DirectLiveCommand = {
  frameId: string; page: string; target: string;
} & (
  | { kind: "click" | "dblclick" | "contextmenu" }
  | { kind: "input"; value: string; start?: number; end?: number }
  | { kind: "key"; key: string; shift?: boolean }
  | { kind: "wheel"; deltaX: number; deltaY: number }
  | { kind: "mouse"; x: number; y: number }
);
export interface LiveFocus { target: string; value?: string; start?: number; end?: number }
const PRIVATE = "[data-live-private],[data-live-view-ui],[data-testid*='chat'],[data-live-protected]";
const ids = new WeakMap<HTMLElement, string>();
const frames = new Map<string, Map<string, { element: HTMLElement; signature: string }>>();
export function isPrivateDirectPage(page: string) {
  return /^\/(profil|users|settings|berechtigungen|chat|login|passwort|password|reset-password)(\/|$|-)/.test(page);
}
function sensitive(element: HTMLElement) {
  const field = element as HTMLInputElement;
  return ["password", "hidden", "file"].includes(field.type) ||
    /password|passwort|kennwort|secret|token|api.?key|otp|one.?time/i.test([
      field.name, field.id, field.getAttribute("autocomplete"), field.getAttribute("aria-label"),
      field.getAttribute("placeholder"), ...Array.from(field.labels ?? []).map(l => l.textContent),
    ].join(" "));
}
export function isProtectedLiveElement(element: HTMLElement) {
  return !!element.closest(PRIVATE) || sensitive(element) ||
    !!element.closest("form")?.querySelector("input[type='password']");
}
function signature(element: HTMLElement) {
  // Text-entry values deliberately aren't included: successive keystrokes use one frame.
  return [element.tagName, element.id, element.getAttribute("data-testid"), element.getAttribute("href"),
    element.getAttribute("type"), element.getAttribute("name"), element.getAttribute("role"),
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? "" : element.textContent?.slice(0, 500),
    element.closest("tr,[role='dialog'],[role='alertdialog']")?.textContent?.slice(0, 1500),
  ].join("|");
}
export function registerLiveFrame(frameId: string, originals: Element[], copies: Element[]) {
  const targets = new Map<string, { element: HTMLElement; signature: string }>();
  originals.forEach((element, i) => {
    const copy = copies[i];
    if (!(element instanceof HTMLElement) || !copy) return;
    if (isProtectedLiveElement(element)) {
      copy.setAttribute("data-live-protected", "true"); return;
    }
    let id = ids.get(element);
    if (!id) { id = crypto.randomUUID(); ids.set(element, id); }
    targets.set(id, { element, signature: signature(element) });
    copy.setAttribute("data-live-target", id);
    if (!(element as HTMLInputElement).disabled && element.getAttribute("aria-disabled") !== "true") {
      copy.setAttribute("data-live-actionable", "true");
      if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) &&
          !(element as HTMLInputElement).readOnly &&
          !(element instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "reset", "image"].includes(element.type))) {
        copy.setAttribute("data-live-editable", "true");
      }
    }
  });
  frames.set(frameId, targets);
  while (frames.size > 6) frames.delete(frames.keys().next().value!);
}
export function clearLiveFrames() { frames.clear(); }
function target(command: DirectLiveCommand) {
  const escape = command.kind === "key" && command.key === "Escape";
  if (document.hidden || !document.querySelector("[data-testid='live-control-active-source']") ||
      command.page !== controlPage() || isPrivateDirectPage(controlPage())) throw Error("Geschützter Bereich.");
  const registered = frames.get(command.frameId)?.get(command.target);
  const element = registered?.element;
  if (!element || !element.isConnected || isProtectedLiveElement(element) ||
      registered.signature !== signature(element) || (element as HTMLInputElement).disabled ||
      element.getAttribute("aria-disabled") === "true") throw Error("Element nicht mehr verfügbar.");
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || getComputedStyle(element).visibility === "hidden" ||
      getComputedStyle(element).display === "none" ||
      (!escape && (getComputedStyle(element).pointerEvents === "none" || element.closest("[inert]")))) throw Error("Element nicht sichtbar.");
  const anchor = element.closest<HTMLAnchorElement>("a[href]");
  if (anchor) {
    const url = new URL(anchor.href, location.origin);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    if (url.origin !== location.origin || (base && !url.pathname.startsWith(base + "/")) ||
        isPrivateDirectPage(url.pathname.slice(base.length)) || anchor.hasAttribute("download") ||
        anchor.target === "_blank") throw Error("Externe und geschützte Navigation gesperrt.");
  }
  return element;
}
function click(element: HTMLElement, button = 0) {
  const rect = element.getBoundingClientRect();
  const data = { bubbles: true, cancelable: true, button, buttons: button === 2 ? 2 : 1,
    clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, pointerType: "mouse", pointerId: 1, isPrimary: true };
  element.dispatchEvent(new PointerEvent("pointerdown", data));
  element.dispatchEvent(new MouseEvent("mousedown", data));
  if (!isProtectedLiveElement(element)) element.focus({ preventScroll: true });
  element.dispatchEvent(new PointerEvent("pointerup", { ...data, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...data, buttons: 0 }));
  if (!button) element.click();
}
export function applyDirectLiveCommand(command: DirectLiveCommand) {
  let element = target(command);
  if (command.kind === "key" && command.key === "Escape") {
    // Radix makes the trigger/background inert while its popup is open. Escape
    // belongs to the current source focus, not a forced refocus of that trigger.
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      if (isProtectedLiveElement(active)) throw Error("Geschützter Fokus.");
      element = active;
    }
  }
  if (command.kind === "mouse") {
    if (![command.x, command.y].every(v => Number.isFinite(v) && v >= 0 && v <= 5000)) throw Error();
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse",
      isPrimary: true, clientX: command.x, clientY: command.y }));
    element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: command.x, clientY: command.y }));
  } else if (command.kind === "click") click(element);
  else if (command.kind === "dblclick") element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
  else if (command.kind === "contextmenu") {
    click(element, 2);
    element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  } else if (command.kind === "wheel") {
    if (![command.deltaX, command.deltaY].every(v => Number.isFinite(v) && Math.abs(v) <= 1200)) throw Error();
    let current: HTMLElement | null = element;
    while (current && !isProtectedLiveElement(current)) {
      const style = getComputedStyle(current);
      if ((current.scrollHeight > current.clientHeight && /auto|scroll/.test(style.overflowY)) ||
          (current.scrollWidth > current.clientWidth && /auto|scroll/.test(style.overflowX))) {
        current.scrollTop += command.deltaY; current.scrollLeft += command.deltaX; return;
      }
      current = current.parentElement;
    }
    window.scrollBy(command.deltaX, command.deltaY);
  } else if (command.kind === "input") {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) ||
        (element as HTMLInputElement).readOnly || command.value.length > 5000 ||
        (element instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit"].includes(element.type))) throw Error();
    if (element instanceof HTMLSelectElement && !Array.from(element.options).some(o => o.value === command.value && !o.disabled)) throw Error();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
      element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    element.focus({ preventScroll: true });
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, command.value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (!(element instanceof HTMLSelectElement) && command.start !== undefined) {
      try { element.setSelectionRange(command.start, command.end ?? command.start); } catch { /* native non-text field */ }
    }
  } else if (command.kind === "key") {
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", " "].includes(command.key)) throw Error();
    element.focus({ preventScroll: true });
    const allowed = element.dispatchEvent(new KeyboardEvent("keydown", { key: command.key, shiftKey: !!command.shift, bubbles: true, cancelable: true }));
    if (allowed && command.key === "Enter" && element instanceof HTMLInputElement &&
        element.form && !element.form.querySelector("input[type='password']")) element.form.requestSubmit();
    if (allowed && ["Enter", " "].includes(command.key) && element instanceof HTMLButtonElement) element.click();
    if (allowed && command.key === " " && element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) element.click();
    if (allowed && command.key === "Tab") {
      const elements = Array.from(document.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],[tabindex]"))
        .filter(e => e.tabIndex >= 0 && !(e as HTMLInputElement).disabled && !isProtectedLiveElement(e) && e.getBoundingClientRect().height > 0);
      elements[(elements.indexOf(element) + (command.shift ? -1 : 1) + elements.length) % elements.length]?.focus();
    }
    element.dispatchEvent(new KeyboardEvent("keyup", { key: command.key, shiftKey: !!command.shift, bubbles: true }));
  }
}
