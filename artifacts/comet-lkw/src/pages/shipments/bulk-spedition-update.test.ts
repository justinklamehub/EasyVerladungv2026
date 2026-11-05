import { strict as assert } from "node:assert";
import { test } from "node:test";
import { updateShipmentSpeditionen } from "./bulk-spedition-update";

test("Alle gewählten Verladungen erhalten dieselbe neue Spedition", async () => {
  const requests: [number, number][] = [];
  const result = await updateShipmentSpeditionen([11, 12, 13], 7, async (id, target) => {
    requests.push([id, target]);
  });
  assert.deepEqual(requests, [[11, 7], [12, 7], [13, 7]]);
  assert.deepEqual(result, { succeeded: [11, 12, 13], failed: [] });
});

test("Teilfehler werden getrennt gemeldet und verhindern übrige Aktualisierungen nicht", async () => {
  const result = await updateShipmentSpeditionen([11, 12, 13], 7, async id => {
    if (id === 12) throw new Error("Keine Berechtigung");
  });
  assert.deepEqual(result, { succeeded: [11, 13], failed: [12] });
});

test("Große Auswahl verwendet höchstens fünf parallele Anfragen", async () => {
  let running = 0;
  let maximum = 0;
  const ids = Array.from({ length: 17 }, (_, i) => i + 1);
  const result = await updateShipmentSpeditionen(ids, 7, async () => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 1));
    running--;
  });
  assert.equal(maximum, 5);
  assert.deepEqual(result.succeeded, ids);
});
