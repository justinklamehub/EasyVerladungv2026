import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClockEntry } from "@workspace/api-client-react";
import { attendanceShiftOptions, filterAttendance, NO_SHIFT, shiftFilterValue } from "./attendance-filters";
import { clockCsvRows, defaultClockCsvConfig } from "./csv-export";

const base: ClockEntry = {
  id: 1, employeeId: 1, cardNumber: "0001", firstName: "Anna", lastName: "Test",
  provider: "Firma A", activity: "Lager", shiftName: "Frühschicht",
  startedAt: "2026-10-19T04:00:00Z", endedAt: "2026-10-19T12:00:00Z",
  originalStartedAt: "2026-10-19T04:00:00Z", originalEndedAt: "2026-10-19T12:00:00Z",
  bookedStart: "2026-10-19T04:00:00Z", bookedEnd: "2026-10-19T12:00:00Z",
  grossMinutes: 480, pauseMinutes: 30, netMinutes: 450, pauseOverride: null,
  source: "manual", updatedAt: "2026-10-19T12:00:00Z",
};
const entries: ClockEntry[] = [
  base,
  { ...base, id: 2, employeeId: 2, firstName: "Ben", shiftName: "Spätschicht", netMinutes: 400 },
  { ...base, id: 3, shiftName: "Frühschicht", endedAt: null, netMinutes: null },
  { ...base, id: 4, shiftName: null },
  { ...base, id: 5, shiftName: undefined },
  { ...base, id: 6, shiftName: "Historische Schicht" },
];
const filters = { search: "", status: "all", shift: "" };
const ids = (rows: ClockEntry[]) => rows.map((entry) => entry.id);

test("Alle, einzelne und fehlende Schichten werden anhand der gespeicherten Buchung gefiltert", () => {
  assert.deepEqual(ids(filterAttendance(entries, filters)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids(filterAttendance(entries, { ...filters, shift: shiftFilterValue("Frühschicht") })), [1, 3]);
  assert.deepEqual(ids(filterAttendance(entries, { ...filters, shift: shiftFilterValue("Spätschicht") })), [2]);
  assert.deepEqual(ids(filterAttendance(entries, { ...filters, shift: NO_SHIFT })), [4, 5]);
  assert.deepEqual(ids(filterAttendance(entries, { ...filters, shift: shiftFilterValue("Historische Schicht") })), [6]);
});

test("Schicht, Status und Suche werden mit UND kombiniert; keine Treffer sind kein ungefilterter Rückfall", () => {
  assert.deepEqual(ids(filterAttendance(entries, { search: "ANNA", status: "closed", shift: shiftFilterValue("Frühschicht") })), [1]);
  assert.deepEqual(ids(filterAttendance(entries, { search: "Firma A", status: "open", shift: shiftFilterValue("Frühschicht") })), [3]);
  assert.deepEqual(filterAttendance(entries, { search: "Ben", status: "all", shift: shiftFilterValue("Frühschicht") }), []);
  assert.deepEqual(filterAttendance([], filters), []);
});

test("Schichtauswahl enthält historische Namen genau einmal und erhält eine Auswahl ohne aktuelle Treffer", () => {
  assert.deepEqual(attendanceShiftOptions(entries).map((option) => option.label), ["Frühschicht", "Historische Schicht", "Spätschicht"]);
  const selected = shiftFilterValue("Nachtschicht");
  assert.deepEqual(attendanceShiftOptions([], selected), [{ value: selected, label: "Nachtschicht" }]);
  assert.notEqual(shiftFilterValue("none"), NO_SHIFT);
});

test("Wechselschichten derselben Person werden getrennt ausgewertet; CSV und Summen erhalten nur die gefilterten Zeilen", () => {
  const rotating = [base, { ...base, id: 7, shiftName: "Spätschicht", netMinutes: 420 }];
  const before = structuredClone(rotating);
  const rows = filterAttendance(rotating, { ...filters, shift: shiftFilterValue("Spätschicht") });
  assert.deepEqual(ids(rows), [7]);
  assert.equal(rows.reduce((sum, entry) => sum + (entry.netMinutes ?? 0), 0), 420);
  const csv = clockCsvRows(rows, defaultClockCsvConfig());
  assert.equal(csv.length, 2, "Kopfzeile plus genau eine ausgewählte Buchung");
  assert.equal(csv[1][8], "7:00");
  assert.deepEqual(rotating, before, "Filtern verändert keine gespeicherten Zeitdaten");
});
