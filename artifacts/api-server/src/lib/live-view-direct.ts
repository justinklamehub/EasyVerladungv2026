const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
const number = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max;
export const DIRECT_KINDS = ["click", "dblclick", "contextmenu", "input", "key", "wheel", "mouse"];
export function sanitizeDirectCommand(command: any) {
  if (!command || !DIRECT_KINDS.includes(command.kind) || !uuid(command.frameId) || !uuid(command.target) ||
      typeof command.page !== "string" || !/^\/[^?#\s]{0,199}$/.test(command.page)) throw Error();
  const safe = { kind: command.kind, frameId: command.frameId, target: command.target, page: command.page };
  if (command.kind === "input") {
    if (typeof command.value !== "string" || command.value.length > 5000 ||
        (command.start !== undefined && (!Number.isInteger(command.start) || command.start < 0 || command.start > 5000)) ||
        (command.end !== undefined && (!Number.isInteger(command.end) || command.end < 0 || command.end > 5000))) throw Error();
    return { ...safe, value: command.value, start: command.start, end: command.end };
  }
  if (command.kind === "key") {
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", " "].includes(command.key) ||
        (command.shift !== undefined && typeof command.shift !== "boolean")) throw Error();
    return { ...safe, key: command.key, shift: !!command.shift };
  }
  if (command.kind === "wheel") {
    if (!number(command.deltaX, 1200) || !number(command.deltaY, 1200)) throw Error();
    return { ...safe, deltaX: command.deltaX, deltaY: command.deltaY };
  }
  if (command.kind === "mouse") {
    if (!number(command.x, 5000) || !number(command.y, 5000) || command.x < 0 || command.y < 0) throw Error();
    return { ...safe, x: command.x, y: command.y };
  }
  return safe;
}
