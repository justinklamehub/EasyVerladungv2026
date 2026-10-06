import assert from "node:assert/strict";
import test from "node:test";
import { reservationDeadline, hasOverdueReservation } from "./reservation-deadlines";
import { todayOrdinal, parseDeliveryTerm } from "./delivery-deadlines";
import { openReservationsByShelf } from "./shelf-reservations";
import { calendarWeek } from "../../../../../api-server/src/lib/einlagerung/calendar";

const day = (date: string) => todayOrdinal(new Date(`${date}T12:00:00Z`));
const check = (termin: unknown, plusKw: unknown = "", today = day("2026-10-06")) =>
  reservationDeadline({ status: "offen", termin, plusKw }, today);

test("Datum läuft erst nach dem Kalendertag ab, Plus-KW verlängert auch genaue Termine", () => {
  for (const term of ["05.10.2026", "2026-10-05", "20261005"]) {
    assert.equal(check(term).status, "overdue");
    assert.equal(check(term, "01").status, "pending");
    assert.equal(check(term, 1, day("2026-10-12")).status, "pending");
    assert.equal(check(term, 1, day("2026-10-13")).status, "overdue");
    assert.ok(check(term, 1).detail.includes("12.10.2026"));
  }
  assert.equal(check("2026-10-06", "0").status, "pending");
  assert.equal(check("2026-10-07").status, "pending");
});

test("Historische KW.Jahr läuft erst nach Sonntag ab; Plus-KW überschreitet Jahresgrenzen", () => {
  assert.equal(check("40.2026", "", day("2026-10-04")).status, "pending");
  assert.equal(check("40.2026", "", day("2026-10-05")).status, "overdue");
  assert.equal(check("40.2026", "1", day("2026-10-11")).status, "pending");
  assert.equal(check("40.2026", "1", day("2026-10-12")).status, "overdue");
  for (const term of ["53.2020", "KW 53.2020", "53/2020", "53-2020"]) {
    assert.equal(check(term, "02", day("2021-01-17")).status, "pending");
    assert.equal(check(term, "02", day("2021-01-18")).status, "overdue");
    assert.ok(check(term, "02").detail.includes("17.01.2021"));
  }
  assert.equal(check("1.2021", "", day("2021-01-10")).status, "pending");
  assert.equal(check("1.2021", "", day("2021-01-11")).status, "overdue");
});

test("Gültige und ungültige KW stimmen mit der bestehenden API-Kalenderwochenlogik überein", () => {
  for (let year = 1999; year <= 2030; year++) {
    for (let week = 0; week <= 54; week++) {
      const term = `${week}.${year}`;
      assert.equal(parseDeliveryTerm(term).kind === "week", !!calendarWeek(term), term);
    }
  }
});

test("Unklare Alttermine und Plus-KW sind nicht überfällig, auch bei sehr alten Angaben", () => {
  for (const term of ["", null, "KW 40", "40.26", "53.2025", "0.2020", "54.2020", "31.02.2020", "später", "2026-02-29"]) {
    assert.equal(check(term).status, "unknown", String(term));
  }
  for (const plus of ["-1", "1.5", "2 KW", "+2", "unbekannt", "1e2", "9007199254740993", "999999999", true]) {
    assert.equal(check("1.2020", plus).status, "unknown", String(plus));
  }
  for (const plus of ["", null, undefined, " 02 ", 0]) assert.notEqual(check("1.2020", plus).status, "unknown");
  assert.equal(check("31.12.9999", "1").status, "unknown");
});

test("Berliner Tagesgrenze, Schaltjahr und Zeitumstellung ohne Stundenverschiebung", () => {
  const row = { status: "offen", termin: "2026-10-06", plusKw: "" };
  assert.equal(reservationDeadline(row, todayOrdinal(new Date("2026-10-06T21:59:00Z"))).status, "pending");
  assert.equal(reservationDeadline(row, todayOrdinal(new Date("2026-10-06T22:00:00Z"))).status, "overdue");
  assert.equal(check("2024-02-29", "1", day("2024-03-07")).status, "pending");
  assert.equal(check("2026-03-22", "1", day("2026-03-29")).status, "pending");
  assert.equal(check("2026-10-18", "1", day("2026-10-26")).status, "overdue");
});

test("Nur offene Einträge warnen; Filter und Projektion verändern keine Quelldaten", () => {
  const records = ["offen", "erledigt", "storniert", ""].map((status, i) => ({
    id: i + 1, kind: "reservation", updatedAt: "", d: { status, shelfId: 3, termin: "1.2020", plusKw: "1" },
  }));
  records.push({ id: 5, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 4, termin: "unbekannt", plusKw: "" } });
  records.push({ id: 6, kind: "reservation", updatedAt: "", d: { status: "offen", shelfId: 5, termin: "2026-10-06", plusKw: "" } });
  const before = JSON.stringify(records);
  const rows = openReservationsByShelf(records, [], () => "", day("2026-10-06"));
  assert.deepEqual(rows.get(3)?.map((r) => r.id), [1]);
  assert.deepEqual([...rows].filter(([, rs]) => hasOverdueReservation(rs)).map(([id]) => id), [3]);
  assert.equal(hasOverdueReservation([]), false);
  for (const status of ["erledigt", "storniert", "", null]) {
    assert.equal(reservationDeadline({ status, termin: "1.2020" }).status, "inactive");
    assert.equal(hasOverdueReservation([{ status, reservationDeadline: { status: "overdue" } }]), false);
  }
  assert.equal(JSON.stringify(records), before);
});
