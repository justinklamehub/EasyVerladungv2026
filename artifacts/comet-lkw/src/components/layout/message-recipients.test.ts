import test from "node:test";
import assert from "node:assert/strict";
import { filterRecipients } from "./message-recipients";

const users = [
  { id: 10, username: "Müller10", role: "speditions_bearbeiter", speditionName: "Nord Transport", isActive: true },
  { id: 2, username: "Müller2", role: "comet_lager", speditionName: null, isActive: false },
  { id: 3, username: "Anna", role: "custom_role", speditionName: "Süd Transport", isActive: true },
];
test("all users are suggested, including inactive accounts, in natural order", () => {
  assert.deepEqual(filterRecipients(users, "").map((u) => u.id), [3, 2, 10]);
  assert.deepEqual(users.map((u) => u.id), [10, 2, 3]);
});
test("search finds usernames, carrier names and role labels without case or accent sensitivity", () => {
  assert.deepEqual(filterRecipients(users, "MULLER").map((u) => u.id), [2, 10]);
  assert.deepEqual(filterRecipients(users, "nord bearbeiter").map((u) => u.id), [10]);
  assert.deepEqual(filterRecipients(users, "lager").map((u) => u.id), [2]);
  assert.deepEqual(filterRecipients(users, "custom_role").map((u) => u.id), [3]);
  assert.deepEqual(filterRecipients(users, "  SUD  ").map((u) => u.id), [3]);
  assert.equal(filterRecipients(users, "nicht-vorhanden").length, 0);
});
