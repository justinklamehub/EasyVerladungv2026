import assert from "node:assert/strict";
import { test } from "node:test";
import { DEADLINE_COLUMNS, defaultDeadlineColumns, moveDeadlineColumn, parseDeadlineColumns } from "./deadline-columns";

test("the default view includes all eleven columns in their original order", () => {
  const config = defaultDeadlineColumns();
  assert.equal(config.columns.length, 11);
  assert.deepEqual(config.columns.map((c) => c.id), DEADLINE_COLUMNS.map(([id]) => id));
  assert.ok(config.columns.every((c) => c.visible));
});

test("column moves preserve visibility and do not mutate the saved view", () => {
  const original = defaultDeadlineColumns();
  original.columns[1].visible = false;
  const moved = moveDeadlineColumn(original, "date", -1);
  assert.deepEqual(moved.columns.slice(0, 2), [{ id: "date", visible: false }, { id: "status", visible: true }]);
  assert.equal(original.columns[0].id, "status");
  assert.deepEqual(moveDeadlineColumn(original, "status", -1), original);
  assert.deepEqual(moveDeadlineColumn(original, "paletten", 1), original);
  assert.deepEqual(moveDeadlineColumn(moved, "date", 1), original);
});

test("saved hidden columns and custom ordering survive a JSON round trip", () => {
  const config = moveDeadlineColumn(defaultDeadlineColumns(), "deliveryNumber", -1);
  config.columns.find((c) => c.id === "spedition")!.visible = false;
  const loaded = parseDeadlineColumns(JSON.parse(JSON.stringify(config)));
  assert.deepEqual(loaded, config);
  assert.deepEqual(loaded.columns.filter((c) => c.visible).map((c) => c.id),
    ["status", "date", "remaining", "deliveryNumber", "shelf", "debitor", "debitorName", "relation", "plusKw", "paletten"]);
  loaded.columns[0].visible = false;
  assert.equal(config.columns[0].visible, true);
});

test("invalid configurations and hiding every column are rejected", () => {
  const original = defaultDeadlineColumns();
  const duplicate = structuredClone(original);
  duplicate.columns[0].id = "date";
  const hidden = structuredClone(original);
  hidden.columns.forEach((c) => { c.visible = false; });
  for (const input of [null, {}, { ...original, version: 2 }, { ...original, columns: [] }, duplicate,
    { ...original, columns: [{ id: "unknown", visible: true }, ...original.columns.slice(1)] },
    { ...original, columns: [{ id: "status", visible: "true" }, ...original.columns.slice(1)] }]) {
    assert.throws(() => parseDeadlineColumns(input), /Ungültige/);
  }
  assert.throws(() => parseDeadlineColumns(hidden), /mindestens eine/);
});

test("resetting the view creates fresh defaults without affecting existing settings", () => {
  const config = defaultDeadlineColumns();
  config.columns.reverse();
  config.columns[0].visible = false;
  assert.deepEqual(defaultDeadlineColumns().columns[0], { id: "status", visible: true });
  assert.ok(defaultDeadlineColumns().columns.every((c) => c.visible));
});
