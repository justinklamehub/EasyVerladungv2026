import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLiveSurface } from "./live-view-surface";

const surface = { page: "/shipments", navigation: [{ path: "/dashboard", label: "Dashboard" }],
  filters: [{ id: "search", label: "Suche", value: "", kind: "text" },
    { id: "status", label: "Status", value: "all", kind: "select", options: [{ value: "all", label: "Alle" }] }],
  scrollable: true };
test("Live-Steuerfläche übernimmt ausschließlich bekannte Felder", () => {
  assert.deepEqual(sanitizeLiveSurface({ ...surface, script: "bad", filters: surface.filters.map(f => ({ ...f, handler: "bad" })) }), surface);
});
test("Ungültige und übergroße Steuerflächen werden nicht weitergereicht", () => {
  for (const value of [null, { ...surface, filters: {} }, { ...surface, navigation: Array(51).fill(surface.navigation[0]) },
    { ...surface, filters: [{ ...surface.filters[0], value: "x".repeat(201) }] },
    { ...surface, filters: [{ ...surface.filters[1], options: [null] }] }]) {
    assert.equal(sanitizeLiveSurface(value), null);
  }
});
