import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClockEntry } from "@workspace/api-client-react";
import { clockCsvRows, defaultClockCsvConfig, legacyClockCsvConfig, parseClockCsvConfig, validateClockCsvConfig } from "./csv-export";
import { csvCell, parseCsv } from "./csv";

const entry: ClockEntry = {
  id: 1, employeeId: 2, cardNumber: "0002", firstName: "Anna", lastName: "Müller",
  provider: "Dienst; GmbH", activity: "Lager",
  startedAt: "2026-10-15T05:52:00Z", endedAt: "2026-10-15T15:04:00Z",
  originalStartedAt: "2026-10-15T05:51:00Z", originalEndedAt: "2026-10-15T15:05:00Z",
  bookedStart: "2026-10-15T06:00:00Z", bookedEnd: "2026-10-15T15:00:00Z",
  grossMinutes: 540, pauseMinutes: 30, netMinutes: 510, pauseOverride: 30,
  source: "manual", updatedAt: "2026-10-15T16:00:00Z", reason: "Arzttermin",
};

test("the requested headers, booked times and entry reason are exported by default", () => {
  assert.deepEqual(clockCsvRows([entry], defaultClockCsvConfig()), [
    ["Vorname", "Nachname", "Dienstleister", "Tätigkeit", "Arbeitsbeginn", "Arbeitsende", "Gesamtarbeitszeit", "Pausenzeit", "Arbeitszeit", "Grund"],
    ["Anna", "Müller", "Dienst; GmbH", "Lager", "15.10.2026 08:00:00", "15.10.2026 17:00:00", "9:00", "0:30", "8:30", "Arzttermin"],
  ]);
});

test("selection, ordering and renamed headers preserve the corresponding data", () => {
  const config = defaultClockCsvConfig();
  config.columns.forEach((c) => { c.enabled = c.id === "lastName" || c.id === "firstName"; });
  const last = config.columns.splice(1, 1)[0];
  last.header = "Familienname";
  config.columns.unshift(last);
  assert.deepEqual(clockCsvRows([entry], config), [["Familienname", "Vorname"], ["Müller", "Anna"]]);
  assert.deepEqual(parseClockCsvConfig(JSON.parse(JSON.stringify(config))), config);
});

test("minute format keeps numeric values and zero breaks", () => {
  const config = defaultClockCsvConfig();
  config.durationFormat = "minutes";
  assert.deepEqual(clockCsvRows([{ ...entry, pauseMinutes: 0, netMinutes: 540 }], config)[1].slice(6, 9), [540, 0, 540]);
});

test("open shifts do not invent end times or completed durations", () => {
  const rows = clockCsvRows([{ ...entry, endedAt: null, bookedEnd: null, originalEndedAt: null }], defaultClockCsvConfig());
  assert.deepEqual(rows[1].slice(5), ["", "", "", "", "Arzttermin"]);
});

test("night shifts and winter-time conversion include unambiguous calendar dates", () => {
  const rows = clockCsvRows([{ ...entry, bookedStart: "2026-12-01T22:00:00Z", bookedEnd: "2026-12-02T05:00:00Z" }], defaultClockCsvConfig());
  assert.deepEqual(rows[1].slice(4, 6), ["01.12.2026 23:00:00", "02.12.2026 06:00:00"]);
});

test("empty selections, duplicate/blank headers and malformed stored preferences are rejected", () => {
  const empty = defaultClockCsvConfig();
  empty.columns.forEach((c) => { c.enabled = false; });
  assert.match(validateClockCsvConfig(empty)!, /mindestens/);
  const duplicate = defaultClockCsvConfig();
  duplicate.columns[1].header = " vorname ";
  assert.match(validateClockCsvConfig(duplicate)!, /doppelt/);
  duplicate.columns[1].header = "";
  assert.match(validateClockCsvConfig(duplicate)!, /Überschrift/);
  for (const value of [null, {}, { version: 1, durationFormat: "hhmm", columns: [] },
    { ...defaultClockCsvConfig(), durationFormat: "days" }]) assert.throws(() => parseClockCsvConfig(value));
});

test("all previous export fields remain available, including original timestamps and leading-zero cards", () => {
  const rows = clockCsvRows([entry], legacyClockCsvConfig());
  assert.equal(rows[0].length, 19);
  assert.equal(rows[1][1], "0002");
  assert.deepEqual(rows[1].slice(10, 14), [540, 30, 510, 30]);
  assert.equal(rows[1][16], "15.10.2026 07:51:00");
});

test("old personal CSV layouts gain Grund without losing their order, custom labels or choices", () => {
  const old = defaultClockCsvConfig();
  old.columns = old.columns.filter((c) => c.id !== "reason").reverse();
  old.columns[0].header = "Eigene Überschrift";
  old.columns[0].enabled = false;
  const upgraded = parseClockCsvConfig(old);
  assert.deepEqual(upgraded.columns.slice(0, -1), old.columns);
  assert.deepEqual(upgraded.columns.at(-1), { id: "reason", header: "Grund", enabled: true });
  const collision = structuredClone(old);
  collision.columns[0].header = "Grund";
  assert.equal(validateClockCsvConfig(parseClockCsvConfig(collision)), null);
  upgraded.columns.at(-1)!.enabled = false;
  assert.equal(parseClockCsvConfig(upgraded).columns.at(-1)!.enabled, false);
});

test("reasons keep multiline text, quotes and semicolons safe in CSV, including formula protection", () => {
  for (const reason of ['Arzt; "Termin"\nFortsetzung', '=HYPERLINK("unsafe")', "", undefined]) {
    const rows = clockCsvRows([{ ...entry, reason }], defaultClockCsvConfig());
    const parsed = parseCsv("\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"));
    assert.equal(parsed[0].grund, reason?.startsWith("=") ? `'${reason}` : reason ?? "");
  }
});

test("the existing CSV quoting protects semicolons, line breaks, quotes and spreadsheet formulas", () => {
  const config = defaultClockCsvConfig();
  config.columns[0].header = '=Vorname;"Test"';
  const rows = clockCsvRows([{ ...entry, firstName: '=HYPERLINK("unsafe")', provider: "A;\nB" }], config);
  const text = "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const parsed = parseCsv(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]["'=vorname;\"test\""], "'=HYPERLINK(\"unsafe\")");
  assert.equal(parsed[0].dienstleister, "A;\nB");
});
