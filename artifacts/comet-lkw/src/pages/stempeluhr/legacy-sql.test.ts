import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLegacySql } from "./legacy-sql";

const employee = `INSERT INTO \`mitarbeiter\` (\`id\`,\`vorname\`,\`nachname\`,\`mitarbeiterid\`,\`tatigkeit\`,\`dienstleister\`) VALUES
  (1, 'Jörg', 'O\\'Brien', '00123', 'Lager; A', 'Test, GmbH');`;
const entries = `INSERT INTO \`anwesenheit\` (\`id\`,\`vorname\`,\`nachname\`,\`mitarbeiterid\`,\`time_begin\`,\`time_end\`) VALUES
  (5, 'Jörg', 'O\\'Brien', '00123', 1791953100, NULL),
  (6, 'Jörg', 'O\\'Brien', '00123', '1791953100', 0);`;
test("reads only whitelisted INSERT values, preserves text, Unicode and zeroes", () => {
  const parsed = parseLegacySql(`-- export\nSTART TRANSACTION;\nDROP TABLE users;\n${employee}\n${entries}\nCOMMIT;`, true);
  assert.deepEqual(parsed.employees[0], { cardNumber: "00123", firstName: "Jörg", lastName: "O'Brien", activity: "Lager; A", provider: "Test, GmbH", active: true });
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].legacyId, "5");
  assert.equal(parsed.entries[0].endedAt, null);
  assert.equal(parsed.entries[1].endedAt, null);
  assert.equal(parsed.entries[0].startedAt, new Date(1791953100000).toISOString());
  assert.equal(parsed.legacyTimesAcknowledged, true);
});
test("SQL-looking strings and comments are just data, not operations", () => {
  const sql = employee.replace("Test, GmbH", "INSERT INTO mitarbeiter; -- DROP TABLE users;") + "\n/* IGNORE; */\n";
  assert.equal(parseLegacySql(sql).employees[0].provider, "INSERT INTO mitarbeiter; -- DROP TABLE users;");
});
test("malformed expressions, incomplete dump and mismatched column count are rejected", () => {
  assert.throws(() => parseLegacySql(employee.replace("'00123'", "CONCAT('00','123')")), /Datenwert/);
  assert.throws(() => parseLegacySql(employee.replace("'Test, GmbH'", "'unfinished")), /unvollständig/);
  assert.throws(() => parseLegacySql(employee.replace(", 'Test, GmbH'", "")), /Anzahl/);
});
test("zero or missing start is explicitly invalid; an unrelated SQL file has no importable records", () => {
  assert.throws(() => parseLegacySql(entries.replace(/1791953100/g, "0")), /Zeitstempel/);
  assert.throws(() => parseLegacySql("INSERT INTO users(id,password) VALUES(1,'not imported');"), /Keine INSERT/);
});
test("archive recovery preserves orphan history without enabling the old card", () => {
  const parsed = parseLegacySql(entries, true, true);
  assert.equal(parsed.employees.length, 1);
  assert.equal(parsed.employees[0].cardNumber, "00123");
  assert.equal(parsed.employees[0].active, false);
  assert.equal(parsed.employees[0].provider, "");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parseLegacySql(entries, true, false).employees.length, 0);
});
test("archive recovery never guesses between conflicting historical names", () => {
  assert.throws(() => parseLegacySql(entries.replace("(6, 'Jörg'", "(6, 'Anderer'"), true, true), /mehreren Namen/);
});
