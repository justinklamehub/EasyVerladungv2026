export type LookupOption = { value: string; label: string; inputLabel?: string };
const normalize = (value: string) => value.trim().toLocaleLowerCase("de-DE");

export function lookupText(options: LookupOption[], value: unknown) {
  const option = options.find((o) => o.value === String(value));
  return option ? option.inputLabel ?? option.label : "";
}

export function lookupValue(options: LookupOption[], text: string) {
  const matches = options.filter((o) => normalize(o.inputLabel ?? o.label) === normalize(text) ||
    normalize(o.label) === normalize(text));
  return matches.length === 1 ? matches[0].value : undefined;
}
