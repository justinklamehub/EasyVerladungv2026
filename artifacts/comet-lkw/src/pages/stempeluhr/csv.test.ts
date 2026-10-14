import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, parseCsv } from "./csv";
test("card numbers preserve leading zeros, UTF-8 names and escaped separators", () => {
  assert.deepEqual(parseCsv('\uFEFFid;mitarbeiterid;vorname;nachname\r\n1;0051045;"Jörg";"A;B"\r\n'), [
    { id: "1", mitarbeiterid: "0051045", vorname: "Jörg", nachname: "A;B" },
  ]);
});
test("comma-delimited quoted exports and multiline cells are supported", () => {
  assert.deepEqual(parseCsv('"id","mitarbeiterid","note"\n"1","001","A\n""B"""'), [{ id: "1", mitarbeiterid: "001", note: 'A\n"B"' }]);
});
test("malformed quote, extra fields and duplicate headers are explicit errors", () => {
  assert.throws(() => parseCsv('id;name\n1;"unfinished'), /geschlossen/);
  assert.throws(() => parseCsv('id;name\n1;two;three'), /Anzahl/);
  assert.throws(() => parseCsv('id;id\n1;2'), /Spaltenüberschriften/);
  assert.throws(() => parseCsv('id;name\n1;"a"x'), /Anführungszeichen/);
});
test("exports escape cells and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("001"), '"001"');
  assert.equal(csvCell(null), '""');
});
