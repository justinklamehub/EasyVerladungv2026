import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCsv, quantityPieces, resolveArticle, type Row } from "./model";
import { parseWvvnSql } from "./import";
import { berlinNow, recipients } from "./reports";

const a = { id: 1, number: "00000123", ean: "4000000000123", veEan: "4000000000999", name: "Testartikel", active: true, veFactor: 12, updatedAt: "2026-10-19T00:00:00Z" };
test("actual EAN and VE matches have correct unit and automatic behavior", () => {
  assert.equal(resolveArticle([a], a.number, true).autoAdd, false);
  assert.equal(resolveArticle([a], a.ean, true).autoAdd, true);
  assert.equal(resolveArticle([a], a.veEan, true).unit, "VE");
  assert.equal(resolveArticle([a], a.veEan, false).autoAdd, false);
  const numericArticle = { ...a, number: "1234567890123" };
  assert.equal(resolveArticle([numericArticle], numericArticle.number, true).autoAdd, false);
});
test("inactive, missing and ambiguous codes fail visibly instead of picking first", () => {
  assert.throws(() => resolveArticle([{ ...a, active: false }], a.ean, true), /inaktiv/);
  assert.throws(() => resolveArticle([a], "unknown", true), /nicht gefunden/);
  assert.throws(() => resolveArticle([a, { ...a, id: 2 }], a.ean, true), /mehreren Artikeln/);
});
test("piece conversion preserves three decimals and rejects invalid quantities", () => {
  assert.equal(quantityPieces(2, 12, "VE"), 24);
  assert.equal(quantityPieces(2.5, 12, "VE"), 30);
  assert.equal(quantityPieces(2.5, 12, "STK"), 2.5);
  assert.equal(quantityPieces(0.1, 3, "VE"), 0.3);
  for (const value of [0, -1, NaN, Infinity, 1e6 + 1, 0.0001]) assert.throws(() => quantityPieces(value, 12, "STK"));
  assert.throws(() => quantityPieces(0.001, 0.001, "VE"), /Nachkommastellen/);
});
test("CSV groups by article and both flags, with semicolon BOM escaping and formula protection", () => {
  const base: Row = { article_number: "000123", article_name: 'A;"B"\nC', pieces: 0.1, netto: false, kware: true };
  const csv = buildCsv([base, { ...base, pieces: 0.2 }, { ...base, netto: true, pieces: 12 }, { ...base, kware: false, pieces: 24 },
    { ...base, article_number: "=FORMULA", article_name: "+Name", pieces: 1 }]);
  assert.ok(csv.startsWith("\uFEFFArtikelnummer;Artikelname;Netto;K-Ware;Menge;Charge\r\n"));
  assert.ok(csv.includes('"A;""B""\nC";Nein;Ja;0,3;ALLE'));
  assert.ok(csv.includes(";Ja;Ja;12;ALLE"));
  assert.ok(csv.includes(";Nein;Nein;24;ALLE"));
  assert.ok(csv.includes("'=FORMULA;'+Name"));
});
test("Berlin reporting follows local DST and validates recipient lists", () => {
  assert.deepEqual(berlinNow(new Date("2026-10-19T14:00:00Z")), { date: "2026-10-19", time: "16:00" });
  assert.deepEqual(berlinNow(new Date("2026-12-31T23:30:00Z")), { date: "2027-01-01", time: "00:30" });
  assert.deepEqual(recipients("a@example.test; b@example.test,a@example.test"), ["a@example.test", "b@example.test"]);
  assert.throws(() => recipients("a@example.test\r\nBcc: stolen@example.test"));
});
test("SQL import reads only allowed literal data, never executes statements", () => {
  const sql = "DROP TABLE users; INSERT INTO `artikeldaten` (`id`,`artikelnummer`,`artikelname`,`ean`,`veean`,`ve`) VALUES (1,'001','Test','','',12); INSERT INTO `users` (`id`) VALUES(1);";
  const p = parseWvvnSql(sql);
  assert.equal(p.articles.length, 1);
  assert.equal(p.articles[0].artikelnummer, "001");
  assert.equal(p.sessions.length, 0);
  assert.throws(() => parseWvvnSql("DROP TABLE users;"), /Keine unterstützten/);
});
test("SQL import rejects malformed quantities, orphan positions and duplicate IDs", () => {
  const a = "INSERT INTO `artikeldaten` (`id`,`artikelnummer`,`artikelname`,`ve`) VALUES (1,'001','Test',12);";
  assert.throws(() => parseWvvnSql(a + "INSERT INTO `mde_session_items` (`id`,`session_id`,`einheit`,`qty_input`,`ve_faktor`,`qty_stk`,`created_at`) VALUES (1,999,'STK',1,1,1,1700000000);"), /zugehörige Altliste/);
  assert.throws(() => parseWvvnSql(a + a), /doppelte IDs/);
});
test("the provided legacy export retains every supported row and open-list status", () => {
  const p = parseWvvnSql(readFileSync(new URL("../../../../../attached_assets/0_wvvn_(1)_1792411985699.sql", import.meta.url), "utf8"));
  assert.deepEqual([p.articles.length, p.sessions.length, p.items.length, p.reports.length], [609, 1928, 45627, 179]);
  assert.equal(p.sessions.filter((s) => s.status === "open").length, 95);
  assert.equal(p.sessions.filter((s) => s.status === "open" && s.finished_at != null).length, 1);
});
