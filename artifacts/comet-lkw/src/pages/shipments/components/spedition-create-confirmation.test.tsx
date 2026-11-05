import { strict as assert } from "node:assert";
import { test } from "node:test";
import { needsSpeditionConfirmation, summarizeCreationSpeditionen } from "./spedition-create-confirmation";

const own = { id: 1, name: "Eigene Spedition", canCreateShipment: true };
const granted = { id: 2, name: "Freigegebene Spedition", canCreateShipment: true };
const readOnly = { id: 3, name: "Nur lesbar", canCreateShipment: false };

test("Anlage mit fremder Bearbeitungsfreigabe erfordert jedes Mal Bestätigung, auch für eigene Spedition", () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(needsSpeditionConfirmation(false, own.id, [own, granted]), true);
  }
  assert.deepEqual(summarizeCreationSpeditionen([own.id], [own, granted]), [
    { id: own.id, name: own.name, count: 1 },
  ]);
});

test("Ohne Bearbeitungsfreigabe und für interne COMET-Benutzer keine Zusatzabfrage", () => {
  assert.equal(needsSpeditionConfirmation(false, own.id, [own]), false);
  assert.equal(needsSpeditionConfirmation(false, own.id, [own, readOnly]), false);
  assert.equal(needsSpeditionConfirmation(true, null, [own, granted]), false);
  assert.equal(needsSpeditionConfirmation(false, own.id, undefined), false);
});

test("Massenanlage fasst alle Zielspeditionen mit korrekter Anzahl zusammen", () => {
  assert.deepEqual(summarizeCreationSpeditionen([1, 2, 1, 2, 2], [own, granted]), [
    { id: 1, name: own.name, count: 2 },
    { id: 2, name: granted.name, count: 3 },
  ]);
});
