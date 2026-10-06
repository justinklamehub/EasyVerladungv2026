import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SHELF_PLAN_PREFERENCE, parseShelfPlanPreference,
  shelfPlanPreferenceQueryKey, shelfPlanPreferenceSchema,
} from "./shelf-plan-preference";

test("Alle vier Inhalte und beide Darstellungen überleben JSON-Speicherung", () => {
  for (const contentMode of ["planned", "orders", "returns", "reservations"]) {
    for (const view of ["matrix", "tiles"]) {
      const value = { contentMode, view };
      assert.deepEqual(parseShelfPlanPreference(JSON.parse(JSON.stringify(value))), value);
    }
  }
});

test("Ungültige oder fremde Felder setzen die Ansicht sicher zurück", () => {
  for (const value of [
    undefined, null, [], "orders", {},
    { contentMode: "other", view: "tiles" },
    { contentMode: "orders", view: "list" },
    { contentMode: "orders" },
    { contentMode: "orders", view: "tiles", q: "Suchbegriff" },
    { contentMode: "orders", view: "tiles", userId: 12 },
    { contentMode: "orders", view: "tiles", occupancy: [] },
  ]) {
    assert.equal(shelfPlanPreferenceSchema.safeParse(value).success, false);
    assert.deepEqual(parseShelfPlanPreference(value), DEFAULT_SHELF_PLAN_PREFERENCE);
  }
});

test("Navigationscache und spätere Antworten bleiben je Benutzer getrennt", () => {
  const client = new QueryClient();
  const a = shelfPlanPreferenceQueryKey(11);
  const b = shelfPlanPreferenceQueryKey(12);
  client.setQueryData(a, { contentMode: "reservations", view: "tiles" });
  assert.equal(client.getQueryData(b), undefined);
  client.setQueryData(b, { contentMode: "returns", view: "matrix" });
  // A late response for user A must not replace user B's current preference.
  client.setQueryData(a, { contentMode: "orders", view: "tiles" });
  assert.deepEqual(client.getQueryData(shelfPlanPreferenceQueryKey(12)), { contentMode: "returns", view: "matrix" });
  assert.deepEqual(client.getQueryData(shelfPlanPreferenceQueryKey(11)), { contentMode: "orders", view: "tiles" });
  client.clear();
  assert.equal(client.getQueryData(a), undefined);
});
