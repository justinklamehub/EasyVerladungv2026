import assert from "node:assert/strict";
import { test } from "node:test";
import { CreateClockEntryBody, UpdateClockEntryBody, DeleteClockEntryBody } from "@workspace/api-zod";

const entry = {
  employeeId: 1,
  startedAt: "2026-10-19T06:00:00Z",
  endedAt: "2026-10-19T14:00:00Z",
  pauseOverride: null,
};

test("time corrections accept omitted, empty and short optional reasons", () => {
  for (const reason of [undefined, "", " ", "OK", "Zeit korrigiert"]) {
    assert.equal(UpdateClockEntryBody.safeParse({ ...entry, reason }).success, true);
  }
});

test("optional correction reasons still have a length limit", () => {
  assert.equal(UpdateClockEntryBody.safeParse({ ...entry, reason: "x".repeat(1001) }).success, false);
});

test("manual creation and deletion still require a reason", () => {
  for (const reason of [undefined, "", "OK"]) {
    assert.equal(CreateClockEntryBody.safeParse({ ...entry, reason }).success, false);
    assert.equal(DeleteClockEntryBody.safeParse({ reason, expectedUpdatedAt: "2026-10-19T14:00:00Z" }).success, false);
  }
});
