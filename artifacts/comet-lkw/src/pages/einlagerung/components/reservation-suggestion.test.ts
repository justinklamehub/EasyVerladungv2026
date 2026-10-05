import assert from "node:assert/strict";
import test from "node:test";
import { lookupText, lookupValue } from "./field-lookup";
import { suggestReservationShelf } from "./reservation-suggestion";
import type { Rec } from "../lib";
const shelf = (id: number, name: string, extra = {}): Rec => ({
  id, kind: "shelf", updatedAt: "", d: { name, active: true, full: false, ...extra },
});

test("Freie Regaleingabe wird eindeutig zur gespeicherten Regal-ID aufgelöst", () => {
  const options = [{ value: "66", inputLabel: "01-45", label: "Halle 1 / 01 / 01-45" },
    { value: "67", inputLabel: "K", label: "Sonderplätze / K" }];
  assert.equal(lookupValue(options, " 01-45 "), "66");
  assert.equal(lookupValue(options, "k"), "67");
  assert.equal(lookupValue(options, "Halle 1 / 01 / 01-45"), "66");
  assert.equal(lookupValue(options, "unbekannt"), undefined);
  assert.equal(lookupText(options, 66), "01-45");
  assert.equal(lookupText(options, 67), "K");
});

test("Mehrdeutige Bezeichnungen führen niemals zu einer stillen falschen Regalzuordnung", () => {
  assert.equal(lookupValue([
    { value: "1", inputLabel: "A", label: "Halle 1 / A" },
    { value: "2", inputLabel: "A", label: "Halle 2 / A" },
  ], "A"), undefined);
});

test("System bevorzugt unbelegte Regale ohne offene Vormerkung und überspringt voll/inaktiv", () => {
  const shelves = [shelf(1, "01-01", { full: true }), shelf(2, "01-02", { active: false }),
    shelf(3, "01-03"), shelf(4, "01-04"), shelf(5, "01-05")];
  const reserved: Rec[] = [{ id: 9, kind: "reservation", updatedAt: "", d: { shelfId: 4, status: "offen" } }];
  assert.equal(suggestReservationShelf(shelves, [{ shelf: "01-03", ist: 10, retouren: 0, auftraege: 0 }], reserved)?.id, 5);
  assert.equal(suggestReservationShelf(shelves.slice(0, 2), [], []), undefined);
  assert.equal(shelves[0].d.full, true);
});
