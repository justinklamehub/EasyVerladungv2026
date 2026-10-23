import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { listPickupPlans } from "./pickup-plans";
import type { Client } from "./model";

after(async () => { await pool.end(); });

// Read-only inline records shadow every table referenced by listPickupPlans.
// No fixtures, business rows, counters, or database objects are written.
const fixtures = `WITH
  einlagerung_pickup_plans(delivery_number,planned,shipment_id,updated_at) AS (
    VALUES ('8000340',true,340,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000341',true,341,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000342',true,342,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000343',true,343,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000344',true,344,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000345',true,345,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000346',true,346,'2026-10-23T10:00:00Z'::timestamptz),
      ('8000999',true,999,'2026-10-23T10:00:00Z'::timestamptz)
  ),
  shipments(id,spedition_id,kennzeichen,eta_date,eta_time,status,relation) AS (
    VALUES (340,1,'TEST',DATE '2026-10-26','00:00','Angemeldet','Dortmund'),
      (341,1,'TEST',DATE '2026-10-25','00:00','Angemeldet','Dortmund'),
      (342,1,'TEST',DATE '2026-03-29','12:45','Angemeldet','Dortmund'),
      (343,1,'TEST',DATE '2026-03-30','12:45','Angemeldet','Dortmund'),
      (344,1,'TEST',DATE '2026-01-01','00:00','Angemeldet','Dortmund'),
      (345,1,'TEST',DATE '2026-07-01','12:45','Angemeldet','Dortmund'),
      (346,2,'TEST',NULL::date,NULL::text,'Angemeldet','Dortmund')
  ),
  speditionen(id,name) AS (VALUES (1,'Seatrader'),(2,'Andere Spedition'))
`;
const client = {
  query: (sql: string, params: unknown[]) => pool.query(fixtures + sql, params),
} as Client;

test("ETA bleibt ein Kalenderdatum unabhängig von Server-Zeitzone, Sommerzeit und Winterzeit", async () => {
  const plans = await listPickupPlans(client, null);
  const dates = ["2026-10-26", "2026-10-25", "2026-03-29", "2026-03-30", "2026-01-01", "2026-07-01"];
  for (const [index, date] of dates.entries()) {
    assert.equal(plans[index].shipment?.etaDate, date, `LKW ${340 + index} muss ${date} unverändert übertragen`);
  }
  assert.equal(plans[0].shipment?.etaTime, "00:00");
  assert.equal(plans[2].shipment?.etaTime, "12:45");
  assert.equal(plans[6].shipment?.etaDate, "");
  assert.equal(plans[6].shipment?.etaTime, "");
  assert.equal(plans[7].shipment, null);
});

test("Die Datumskorrektur erhält die Sichtbarkeitsgrenzen der Speditionen", async () => {
  const plans = await listPickupPlans(client, [1]);
  assert.equal(plans[0].shipment?.etaDate, "2026-10-26");
  assert.equal(plans[6].shipmentId, 346);
  assert.equal(plans[6].shipment, null);
});
