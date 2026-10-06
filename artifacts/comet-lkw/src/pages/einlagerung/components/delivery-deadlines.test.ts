import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeliveryOrders, deadlineSummary, parseDeliveryTerm, todayOrdinal, validDeadlineThresholds,
  DEFAULT_DEADLINE_THRESHOLDS as limits } from "./delivery-deadlines";

const now = new Date("2026-10-06T12:00:00Z");
const order = (termin: string, paletten = 1) => ({ shelf: "17-01", spedition: "DHL", relation: "FRA", termin, paletten });

test("Alle Grenzen sind einschließlich; überfällige Termine sind immer kritisch", () => {
  const rows = classifyDeliveryOrders([
    order("05.10.2026"), order("06.10.2026"), order("08.10.2026"),
    order("09.10.2026"), order("13.10.2026"), order("14.10.2026"), order("20.10.2026"), order("21.10.2026"),
  ], limits, now);
  assert.deepEqual(rows.map((r) => [r.days, r.status]), [
    [-1, "critical"], [0, "critical"], [2, "critical"], [3, "soon"], [7, "soon"],
    [8, "upcoming"], [14, "upcoming"], [15, "safe"],
  ]);
});
test("Geänderte Einstellungen berechnen vorhandene Aufträge neu; null Tage ist erlaubt", () => {
  assert.equal(classifyDeliveryOrders([order("09.10.2026")], limits, now)[0].status, "soon");
  assert.equal(classifyDeliveryOrders([order("09.10.2026")], { criticalDays: 3, soonDays: 8, upcomingDays: 15 }, now)[0].status, "critical");
  assert.equal(validDeadlineThresholds({ criticalDays: 0, soonDays: 1, upcomingDays: 2 }), true);
  for (const bad of [
    { criticalDays: -1, soonDays: 7, upcomingDays: 14 },
    { criticalDays: 2, soonDays: 2, upcomingDays: 14 },
    { criticalDays: 2, soonDays: 15, upcomingDays: 14 },
    { criticalDays: 2.5, soonDays: 7, upcomingDays: 14 },
    { criticalDays: 2, soonDays: 7, upcomingDays: 3651 },
    { criticalDays: NaN, soonDays: 7, upcomingDays: 14 },
  ]) assert.equal(validDeadlineThresholds(bad), false);
});
test("ISO- und SAP-Datum, Schaltjahre und ungültige Daten", () => {
  for (const value of ["09.10.2026", "2026-10-09", "20261009"]) {
    assert.equal(parseDeliveryTerm(value).kind, "date");
    assert.equal(parseDeliveryTerm(value).label, "09.10.2026");
  }
  assert.equal(parseDeliveryTerm("29.02.2024").kind, "date");
  for (const value of ["29.02.2026", "31.02.2026", "31.04.2026", "2026-13-01", "", "später"]) {
    assert.equal(parseDeliveryTerm(value).kind, "unknown");
  }
});
test("KW-Termine bekommen keinen erfundenen Tag; ISO-Wochenjahre werden validiert", () => {
  for (const value of ["KW 47.2026", "47.2026", "53.2020", "1.2021"]) assert.equal(parseDeliveryTerm(value).kind, "week");
  for (const value of ["53.2025", "54.2026", "0.2026"]) assert.equal(parseDeliveryTerm(value).kind, "unknown");
  const rows = classifyDeliveryOrders([order("47.2026"), order(""), order("unbekannt")], limits, now);
  assert.deepEqual(rows.map((r) => r.status), ["safe", "unknown", "unknown"]);
  assert.equal(rows[0].days, 41);
  assert.ok(rows.slice(1).every((r) => r.days === null));
});
test("Berliner Kalendertag berücksichtigt Mitternacht und Sommerzeit ohne Tagesbruch", () => {
  assert.equal(todayOrdinal(new Date("2026-10-06T22:30:00Z")) - todayOrdinal(now), 1);
  for (const [day, tomorrow] of [["2026-03-28", "29.03.2026"], ["2026-10-24", "25.10.2026"]]) {
    assert.equal(classifyDeliveryOrders([order(tomorrow)], limits, new Date(`${day}T12:00:00Z`))[0].days, 1);
  }
  assert.equal(classifyDeliveryOrders([order("01.01.2027")], limits, new Date("2026-12-31T12:00:00Z"))[0].days, 1);
});
test("Summen sind Paletten, nicht Zeilen; Quellaufträge bleiben unverändert", () => {
  const orders = [order("09.10.2026", 9), order("12.10.2026", 64), order("13.10.2026", 64),
    order("14.10.2026", 64), order("15.10.2026", 58), order("47.2026", 22), order("", 3)];
  const before = JSON.stringify(orders);
  const summary = deadlineSummary(classifyDeliveryOrders(orders, limits, now));
  assert.deepEqual(summary.soon, { orders: 3, pallets: 137 });
  assert.deepEqual(summary.upcoming, { orders: 2, pallets: 122 });
  assert.equal(summary.safe.pallets, 22);
  assert.equal(summary.unknown.pallets, 3);
  assert.equal(JSON.stringify(orders), before);
});
test("Plus-KW verschiebt ohne bestätigte Geschäftsregel keinen Liefertermin", () => {
  const row = classifyDeliveryOrders([{ ...order("09.10.2026"), plusKw: "03" }], limits, now)[0];
  assert.equal(row.status, "soon");
  assert.equal(row.days, 3);
});
