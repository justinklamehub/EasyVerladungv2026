import { test } from "node:test";
import assert from "node:assert/strict";
import type { WarehousePickupPlan } from "@workspace/api-client-react";
import { pickupClipboardText, shipmentPickupNumbers, writePickupClipboard } from "./pickup-clipboard";

const plan = (deliveryNumber: string, shipmentId: number | null = 11, planned = true): WarehousePickupPlan =>
  ({ deliveryNumber, shipmentId, planned, shipment: null, updatedAt: "2026-10-21T12:00:00.000Z" });

test("LKW-Liste enthält jede zugeordnete, eingeplante Lieferung nur einmal und erhält Textnummern", () => {
  const values = shipmentPickupNumbers([plan("80000003"), plan("80000001"), plan("80000001"), plan("00080000002"),
    plan("80000004", 12), plan("80000005", 11, false), plan("80000006", null), plan("")], 11);
  assert.deepEqual(values, ["80000001", "00080000002", "80000003"]);
  const text = pickupClipboardText(values);
  assert.equal(text, "80000001\n00080000002\n80000003");
  assert.equal(text.split("\n").length, values.length);
  assert.ok(!text.endsWith("\n"));
  assert.equal(pickupClipboardText(["80000001"]), "80000001");
  assert.equal(pickupClipboardText([]), "");
});

test("Kopieren übergibt nur die reine Zeilenliste und meldet Browserfehler statt Erfolg vorzutäuschen", async () => {
  let copied = "";
  await writePickupClipboard("80000001\n80000002", { writeText: async (text) => { copied = text; } });
  assert.equal(copied, "80000001\n80000002");
  await assert.rejects(writePickupClipboard("80000001"), /Browser/);
  await assert.rejects(writePickupClipboard("", { writeText: async () => assert.fail("Leere Liste nicht kopieren") }), /Keine Liefernummern/);
  await assert.rejects(writePickupClipboard("80000001", { writeText: async () => { throw new Error("NotAllowedError"); } }), /NotAllowedError/);
});
