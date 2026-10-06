import assert from "node:assert/strict";
import test from "node:test";
import { getSettings, settingsSchema, deadlineThresholdsSchema, defaults, type Client } from "./model";
import { UpdateEinlagerungSettingsBody } from "@workspace/api-zod";

test("Alte gespeicherte Einstellungen erhalten Standardgrenzen ohne andere Werte zu verlieren", async () => {
  const old = { hideFull: true, staleHours: 48, profiles: { artikel: { ean: 2 } }, colors: { free: "#123456", occupied: "#abcdef", full: "#ff0000" } };
  const client = { query: async () => ({ rows: [{ value: JSON.stringify(old) }] }) } as unknown as Client;
  const settings = await getSettings(client);
  assert.deepEqual(settings.deadlineThresholds, defaults.deadlineThresholds);
  assert.equal(settings.hideFull, true);
  assert.deepEqual(settings.colors, old.colors);
  assert.deepEqual(settings.profiles, old.profiles);
});
test("Gültige dynamische Grenzen überleben JSON-Speicherung und den API-Vertrag", () => {
  const deadlineThresholds = { criticalDays: 0, soonDays: 5, upcomingDays: 21 };
  const body = UpdateEinlagerungSettingsBody.parse({ ...defaults, deadlineThresholds });
  const saved = settingsSchema.parse(body);
  assert.deepEqual(settingsSchema.parse(JSON.parse(JSON.stringify(saved))).deadlineThresholds, deadlineThresholds);
});
test("Backend lehnt vertauschte, gleiche und ungültige Grenzen ab", () => {
  for (const invalid of [
    { criticalDays: 7, soonDays: 2, upcomingDays: 14 },
    { criticalDays: 2, soonDays: 7, upcomingDays: 7 },
    { criticalDays: -1, soonDays: 7, upcomingDays: 14 },
    { criticalDays: 2.5, soonDays: 7, upcomingDays: 14 },
    { criticalDays: 2, soonDays: 7, upcomingDays: 3651 },
    { criticalDays: 2, soonDays: 7 },
  ]) assert.equal(deadlineThresholdsSchema.safeParse(invalid).success, false);
});
