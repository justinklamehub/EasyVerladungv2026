import assert from "node:assert/strict";
import { test } from "node:test";
import { selectedCardEmployees, toggleVisibleCards } from "./card-selection";

const employees = [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }];

test("card printing uses exactly selected employees and ignores removed IDs", () => {
  assert.deepEqual(selectedCardEmployees(employees, new Set([2, 3, 99])), [employees[1], employees[2]]);
  assert.deepEqual(selectedCardEmployees(employees, new Set()), []);
});

test("select all acts on visible employees and preserves selections outside the search", () => {
  const selected = new Set([3]);
  const visible = employees.slice(0, 2);
  const all = toggleVisibleCards(selected, visible);
  assert.deepEqual([...all], [3, 1, 2]);
  assert.deepEqual([...toggleVisibleCards(all, visible)], [3]);
  assert.deepEqual([...selected], [3], "does not mutate previous React state");
  assert.deepEqual([...toggleVisibleCards(selected, [])], [3]);
});
