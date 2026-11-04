export function selectedCardEmployees<T extends { id: number }>(employees: readonly T[], selected: ReadonlySet<number>): T[] {
  return employees.filter((employee) => selected.has(employee.id));
}

export function toggleVisibleCards(selected: ReadonlySet<number>, visible: readonly { id: number }[]): Set<number> {
  const next = new Set(selected);
  const allSelected = visible.length > 0 && visible.every((employee) => selected.has(employee.id));
  for (const employee of visible) {
    if (allSelected) next.delete(employee.id);
    else next.add(employee.id);
  }
  return next;
}
