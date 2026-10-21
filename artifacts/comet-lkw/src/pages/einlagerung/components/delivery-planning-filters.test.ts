import { test } from "node:test";
import assert from "node:assert/strict";
import type { WarehousePickupPlan } from "@workspace/api-client-react";
import { parseDeliveryNumbers, pastedDeliveryNumbers, deliveryNumberMatcher, deliveryNumberDetails } from "./delivery-number-list";
import { pickupStage, pickupStatus, matchesPickupFilter, pickupFilterLabel } from "./pickup-status";
import { classifyDeliveryOrders } from "./delivery-deadlines";
import { deadlineFilterDetails, emptyDeadlineFilters, filterDeliveryRows } from "./deadline-filters";
import { pickupNumbers, visiblePickupSelection } from "./pickup-selection-state";

test("Massenauswahl zählt Lieferungen einmal und bearbeitet keine ausgefilterten oder nicht planbaren Zeilen", () => {
  const numbers = pickupNumbers([{ deliveryNumber: "80000001" }, { deliveryNumber: "80000001" }, { deliveryNumber: "80000002" }, { deliveryNumber: "" }, {}, { deliveryNumber: "Artikel" }]);
  assert.deepEqual(numbers, ["80000001", "80000002"]);
  const chosen = new Set(["80000001", "80000002", "80000003"]);
  assert.deepEqual(visiblePickupSelection(chosen, numbers), ["80000001", "80000002"]);
  assert.deepEqual(visiblePickupSelection(chosen, ["80000002"]), ["80000002"]);
  assert.deepEqual(visiblePickupSelection(chosen, []), []);
});

test("Excel-Listen übernehmen alle Nummern mit ODER, entfernen Duplikate und erhalten führende Nullen", () => {
  const numbers = parseDeliveryNumbers('\uFEFFLieferungsnummer\r\n"80000001"\t80000002\r\n80000001;00000003,80000004');
  assert.deepEqual(numbers, ["80000001", "80000002", "00000003", "80000004"]);
  const matches = deliveryNumberMatcher(numbers);
  for (const value of numbers) assert.ok(matches(value));
  assert.equal(matches("800000010"), false, "kein Teilstring-Treffer");
  assert.equal(matches("3"), false, "führende Nullen dürfen nicht wegfallen");
  assert.equal(matches(""), false);
  assert.ok(deliveryNumberMatcher([])("unbekannt"));
  assert.deepEqual(parseDeliveryNumbers(""), []);
});

test("Ungültige oder zu große Excel-Listen werden vollständig abgelehnt, nie teilweise übernommen", () => {
  for (const raw of ["80000001\n8.0002E+7", "80000001\ntext", "Liefernummer", "80000001\n<script>"]) {
    assert.throws(() => parseDeliveryNumbers(raw));
  }
  assert.throws(() => parseDeliveryNumbers(Array.from({ length: 10001 }, (_, i) => `80${i}`).join("\n")), /10.000/);
  const large = parseDeliveryNumbers(Array.from({ length: 10000 }, (_, i) => `80${i}`).join("\t"));
  assert.equal(large.length, 10000);
  const details = deliveryNumberDetails(large);
  assert.ok(details.every(([, value]) => value.length <= 30000));
  assert.deepEqual(parseDeliveryNumbers(details.map(([, value]) => value).join("\n")), large, "Exportmetadaten behalten die gesamte Liste ohne unzulässige Excel-Zelllängen");
  assert.deepEqual(pastedDeliveryNumbers("80000001\n80000002\n80000001"), ["80000001", "80000002"]);
  assert.equal(pastedDeliveryNumbers("Allgemeine Suche"), null);
  assert.equal(pastedDeliveryNumbers("80000001"), null, "einzelner Suchtext behält das bisherige Verhalten");
});

const plan: WarehousePickupPlan = { deliveryNumber: "80000001", planned: true, shipmentId: 11, updatedAt: "2026-10-21T12:00:00.000Z",
  shipment: { id: 11, kennzeichen: "TEST-11", speditionName: "Test", etaDate: "2026-10-21", etaTime: "12:00", status: "Angemeldet", relation: "Nord" } };

test("Abgefertigt wird aus dem aktuellen LKW-Status abgeleitet, ohne die importfeste Planung umzuschreiben", () => {
  const before = structuredClone(plan);
  const done = { ...plan, shipment: { ...plan.shipment!, status: "Abgefertigt" } };
  assert.equal(pickupStage(plan), "planned");
  assert.equal(pickupStage(done), "completed");
  assert.equal(pickupStatus(done), "LKW abgefertigt");
  assert.equal(matchesPickupFilter(done, "completed"), true);
  assert.equal(matchesPickupFilter(done, "planned"), false);
  assert.equal(matchesPickupFilter(done, "unplanned"), false);
  assert.equal(matchesPickupFilter(done, "all"), true);
  assert.equal(pickupFilterLabel("completed"), "LKW abgefertigt");
  assert.deepEqual(plan, before);
  const reopened = { ...done, shipment: { ...done.shipment, status: "Angemeldet" } };
  assert.equal(pickupStage(reopened), "planned");
});

test("Stornierte, fehlende und noch nicht zugeordnete LKW bleiben klar vom Abgefertigt-Status getrennt", () => {
  const cancelled = { ...plan, shipment: { ...plan.shipment!, status: "Storniert" } };
  const unavailable = { ...plan, shipment: null };
  const unassigned = { ...plan, shipmentId: null, shipment: null };
  for (const item of [cancelled, unavailable]) {
    assert.ok(matchesPickupFilter(item, "attention"));
    assert.ok(!matchesPickupFilter(item, "completed"));
    assert.ok(!matchesPickupFilter(item, "unplanned"));
  }
  assert.ok(matchesPickupFilter(unassigned, "planned"));
  assert.ok(matchesPickupFilter(unassigned, "without-truck"));
  assert.ok(!matchesPickupFilter(plan, "without-truck"));
  assert.equal(pickupStatus(undefined), "Noch nicht eingeplant");
  assert.ok(matchesPickupFilter(undefined, "unplanned"));
});

test("Beide Auftragsansichten verwenden dieselbe exakte Nummernliste und kombinieren weitere Filter mit UND", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const rows = classifyDeliveryOrders([
    { deliveryNumber: "80000001", shelf: "A1", debitor: "001234", spedition: "Test", termin: "22.10.2026", paletten: 1 },
    { deliveryNumber: "80000001", shelf: "A2", debitor: "001234", spedition: "Test", termin: "22.10.2026", paletten: 2 },
    { deliveryNumber: "80000002", shelf: "B1", debitor: "991234", spedition: "Andere", termin: "23.10.2026", paletten: 3 },
    { deliveryNumber: "800000010", shelf: "C1", debitor: "001234", spedition: "Test", termin: "23.10.2026", paletten: 4 },
    { deliveryNumber: "80000003", shelf: "D1", debitor: "001234", spedition: "Test", termin: "20.10.2026", paletten: 5 },
  ], { criticalDays: 2, soonDays: 7, upcomingDays: 14 }, now);
  const filters = { ...emptyDeadlineFilters(), deliveryNumbers: parseDeliveryNumbers("80000001\n80000002") };
  assert.equal(filterDeliveryRows(rows, filters).length, 3);
  assert.equal(filterDeliveryRows(rows, { ...filters, debitorPrefix: "00" }).length, 2);
  assert.equal(filterDeliveryRows(rows, { ...filters, facets: { ...filters.facets, spedition: ["Andere"] } })[0].order.deliveryNumber, "80000002");
  assert.equal(filterDeliveryRows(rows, { ...filters, dateFrom: "2026-10-23" }).length, 1);
  assert.equal(filterDeliveryRows(rows, { ...filters, dateTo: "2026-10-22" }).length, 2);
  assert.equal(filterDeliveryRows(rows, { ...filters, overdueOnly: true }).length, 0);
  assert.equal(filterDeliveryRows(rows, { ...filters, dateFrom: "2026-10-25", dateTo: "2026-10-20" }).length, 0);
  const old = emptyDeadlineFilters(); delete old.deliveryNumbers;
  assert.equal(filterDeliveryRows(rows, old).length, 5, "offene Ansichten mit altem Filterzustand bleiben kompatibel");
  assert.ok(deadlineFilterDetails(filters).some(([key, value]) => key.includes("Liefernummernliste") && value.includes("80000001") && value.includes("80000002")));
});
