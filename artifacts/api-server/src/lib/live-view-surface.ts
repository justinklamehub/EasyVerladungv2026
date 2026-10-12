// A socket peer's UI descriptors are never trusted as arbitrary objects.
export function sanitizeLiveSurface(value: any) {
  const short = (text: unknown, max: number) => typeof text === "string" && text.length <= max;
  if (!value || !short(value.page, 200) || !Array.isArray(value.navigation) || value.navigation.length > 50 ||
      !Array.isArray(value.filters) || value.filters.length > 20 || typeof value.scrollable !== "boolean") return null;
  const navigation = [];
  for (const item of value.navigation) {
    if (!item || !short(item.path, 200) || !short(item.label, 80)) return null;
    navigation.push({ path: item.path, label: item.label });
  }
  const filters = [];
  for (const item of value.filters) {
    if (!item || !short(item.id, 80) || !short(item.label, 100) || !short(item.value, 200) ||
        !["text", "date", "select"].includes(item.kind)) return null;
    let options: { value: string; label: string }[] | undefined;
    if (item.kind === "select") {
      if (!Array.isArray(item.options) || item.options.length > 200) return null;
      options = [];
      for (const option of item.options) {
        if (!option || !short(option.value, 200) || !short(option.label, 100)) return null;
        options.push({ value: option.value, label: option.label });
      }
    }
    filters.push({ id: item.id, label: item.label, value: item.value, kind: item.kind, ...(options ? { options } : {}) });
  }
  const safe = { page: value.page, navigation, filters, scrollable: value.scrollable };
  return JSON.stringify(safe).length <= 30_000 ? safe : null;
}
