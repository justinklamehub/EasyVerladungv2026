import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveryReport, deliverReportRecipients, reportClock, reportDate, reportIsDue, reportRecipients, validReportTime } from "./delivery-report-content";
import { classifyDeliveryOrders, DEFAULT_DEADLINE_THRESHOLDS as thresholds } from "@workspace/api-zod/delivery-deadlines";
import { deliveryMailDays, deliveryMailScope } from "@workspace/api-zod/delivery-mail";
const now = new Date("2026-10-06T12:00:00Z");
const order = (termin: string) => ({ termin, shelf: "10-03", spedition: "<script>evil</script>", relation: "A&B", plusKw: "2", paletten: 3 });
const build = (orders: Record<string, any>[]) => buildDeliveryReport({ orders, thresholds, now, appName: "<COMET>", staleHours: 24,
  importedAt: new Date("2026-10-01T10:00:00Z"), filename: "Aufträge.csv" });

test("KW-Resttage zum Montag, einschließlich KW 53, Jahreswechsel und Sortierung", () => {
  assert.equal(classifyDeliveryOrders([order("41.2026")], thresholds, now)[0].days, -1);
  assert.equal(classifyDeliveryOrders([order("40.2026")], thresholds, now)[0].days, -8);
  assert.equal(classifyDeliveryOrders([order("41.2026")], thresholds, new Date("2026-10-05T12:00:00Z"))[0].days, 0);
  assert.equal(classifyDeliveryOrders([order("41.2026")], thresholds, new Date("2026-10-04T12:00:00Z"))[0].days, 1);
  assert.equal(classifyDeliveryOrders([order("53.2020")], thresholds, new Date("2020-12-31T12:00:00Z"))[0].days, -3);
  assert.equal(classifyDeliveryOrders([order("1.2021")], thresholds, new Date("2021-01-03T12:00:00Z"))[0].days, 1);
  assert.equal(classifyDeliveryOrders([order("07.10.2026"), order("41.2026")], thresholds, now)[0].dateLabel, "KW 41.2026");
  assert.equal(classifyDeliveryOrders([order("41.2026")], { criticalDays: 5, soonDays: 7, upcomingDays: 14 }, now)[0].status, "critical");
});
test("Standardauswahl, unbekannte Termine, Importstand und HTML sicher", () => {
  const report = build([order("05.10.2026"), order("41.2026"), order(""), order("21.10.2026")]);
  assert.equal(report.criticalCount, 2);
  assert.equal(report.ordersCount, 2);
  assert.ok(report.text.includes("KW-Beginn: Montag"));
  assert.ok(report.text.includes("veraltet"));
  assert.ok(report.text.includes("Aufträge.csv"));
  assert.ok(report.text.includes("Termine fehlen"));
  assert.ok(!report.html.includes("<script>"));
  assert.ok(report.html.includes("&lt;script&gt;"));
  assert.equal(build([order("41.2026")]).criticalCount, 1);
});
test("Prüfzeit in Berlin, Minuten, Tageswechsel und deaktivierte Automatik", () => {
  const s = { report_delivery_enabled: "1", report_delivery_time: "14:15" };
  assert.equal(reportIsDue(s, now), false);
  assert.equal(reportIsDue(s, new Date("2026-10-06T12:15:00Z")), true);
  assert.equal(reportIsDue({ ...s, report_delivery_enabled: "0" }, now), false);
  assert.equal(reportClock(now), "14:00");
  assert.notEqual(reportDate(now), reportDate(new Date("2026-10-06T22:30:00Z")));
  assert.equal(reportIsDue({ ...s, report_delivery_time: "25:00" }, now), false);
  assert.equal(validReportTime("23:59"), true);
  assert.equal(validReportTime("7:00"), false);
  assert.deepEqual(reportRecipients("One@example.org; two@example.org, ONE@example.org"), ["one@example.org", "two@example.org"]);
  for (const v of ["", "bad", "x@y.org\r\nBcc: z@y.org"]) assert.throws(() => reportRecipients(v));
});
test("Versand nutzt echte Berichtsinhalte; Wiederholung überspringt bereits zugestellte Empfänger", async () => {
  const report = build([order("05.10.2026")]);
  const delivered = ["one@example.org"];
  const sent: string[] = [];
  await deliverReportRecipients(report, ["one@example.org", "two@example.org"], delivered, "from@example.org", async (m) => {
    assert.equal(m.html, report.html); assert.equal(m.text, report.text); sent.push(m.to); return { rejected: [] };
  }, async (to) => { delivered.push(to); });
  assert.deepEqual(sent, ["two@example.org"]);
  await deliverReportRecipients(report, delivered, delivered, "from@example.org", async () => { throw new Error("No resend"); }, async () => {});
  await assert.rejects(deliverReportRecipients(report, ["fail@example.org"], [], "from@example.org", async () => ({ rejected: ["fail@example.org"] }), async () => { throw new Error("Must not record success"); }));
});
test("Mail-Frist ist unabhängig von Lagerwarnungen; exakte Grenze, null Tage und KW-Montag", () => {
  const input = { orders: [order("09.10.2026"), order("42.2026"), order("06.10.2026"), order("05.10.2026"), order("")],
    thresholds, now, appName: "COMET", staleHours: 24, scope: "all" as const };
  assert.equal(buildDeliveryReport({ ...input, warningDays: 0 }).dueCount, 2);
  assert.equal(buildDeliveryReport({ ...input, warningDays: 3 }).dueCount, 3);
  assert.equal(buildDeliveryReport({ ...input, warningDays: 5 }).dueCount, 3);
  assert.equal(buildDeliveryReport({ ...input, warningDays: 6 }).dueCount, 4);
  assert.equal(buildDeliveryReport({ ...input, warningDays: 5 }).criticalCount, 2);
  assert.equal(buildDeliveryReport({ ...input, thresholds: { criticalDays: 0, soonDays: 1, upcomingDays: 2 }, warningDays: 6 }).dueCount, 4);
  assert.equal(deliveryMailDays("0"), 0);
  assert.equal(deliveryMailDays("3650"), 3650);
  for (const v of ["", "-1", "1.5", "3651", "NaN"]) assert.throws(() => deliveryMailDays(v));
});
test("Mail-Auswahl filtert Text, HTML, Summen und Versandgrund, ohne Lagerdaten zu verändern", () => {
  const orders = ["05.10.2026", "08.10.2026", "09.10.2026", "20.10.2026", "21.10.2026", ""]
    .map((date, i) => ({ ...order(date), shelf: `shelf-${i}` }));
  const before = JSON.stringify(orders);
  const input = { orders, thresholds, now, appName: "COMET", staleHours: 24, warningDays: 14,
    bodyTemplate: "{{anzahl}} Gruppen / {{paletten}} Paletten\n{{tabelle}}" };
  const urgent = buildDeliveryReport(input);
  assert.equal(urgent.ordersCount, 3);
  assert.equal(urgent.dueCount, 3);
  assert.ok(urgent.text.startsWith("3 Gruppen / 9 Paletten"));
  for (const i of [3, 4, 5]) {
    assert.ok(!urgent.text.includes(`shelf-${i}`));
    assert.ok(!urgent.html.includes(`shelf-${i}`));
  }
  const critical = buildDeliveryReport({ ...input, scope: "critical" });
  assert.equal(critical.ordersCount, 2);
  assert.equal(critical.dueCount, 2);
  assert.ok(!critical.html.includes("shelf-2"));
  assert.equal(buildDeliveryReport({ ...input, scope: "all" }).ordersCount, 6);
  const empty = buildDeliveryReport({ ...input, orders: [order("20.10.2026")], scope: "urgent" });
  assert.equal(empty.ordersCount, 0);
  assert.equal(empty.dueCount, 0);
  assert.equal(JSON.stringify(orders), before);
  assert.equal(deliveryMailScope(), "urgent");
  for (const v of ["urgent", "critical", "all"]) assert.equal(deliveryMailScope(v), v);
  for (const v of ["", "safe", "unknown"]) assert.throws(() => deliveryMailScope(v));
});
test("Gespeicherte Vorlage, Platzhalter, automatische Tabelle und HTML-Escaping", () => {
  const report = buildDeliveryReport({ orders: [order("41.2026")], thresholds, now, appName: "<COMET>", staleHours: 24,
    warningDays: 5, subjectTemplate: "Test {{app_name}}: {{faellige_anzahl}} / {{tage_vor_liefertermin}}",
    bodyTemplate: "Hallo <script>evil</script>\n{{zusammenfassung}}\n{{tabelle}}" });
  assert.equal(report.subject, "Test <COMET>: 1 / 5");
  assert.ok(report.html.includes("&lt;script&gt;"));
  assert.ok(!report.html.includes("<script>"));
  assert.equal((report.html.match(/<table /g) || []).length, 1);
  assert.ok(report.text.includes("Spedition"));
  const noTable = buildDeliveryReport({ orders: [], thresholds, now, appName: "COMET", staleHours: 24, bodyTemplate: "Nur mein Text" });
  assert.ok(noTable.text.startsWith("Nur mein Text"));
  assert.ok(noTable.html.includes("<table "));
});
