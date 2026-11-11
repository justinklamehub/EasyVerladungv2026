import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { Shipment } from "@workspace/api-client-react";
import { buildExportRows } from "./export-rows";

const shipment = (extra: Partial<Shipment>): Shipment => ({
  id: 1, status: "Verladen", cometBearbeitet: true, gesperrtFuerSpedition: true,
  createdAt: "2026-11-11", updatedAt: "2026-11-11", ...extra,
});

test("both export columns preserve counts, zero, missing receipts and document numbers", () => {
  const rows = buildExportRows([
    shipment({ palettenscheinnummer: "00045, 00046", europalettenVerladen: 45 }),
    shipment({ id: 2, europalettenVerladen: 0 }),
    shipment({ id: 3, europalettenVerladen: null }),
  ]);
  assert.deepEqual(rows.map(r => r["Europaletten verladen"]), [45, 0, ""]);
  assert.deepEqual(rows.map(r => r["Düsseldorfer verladen"]), ["", "", ""]);
  assert.equal(rows[0].Palettenscheinnummer, "00045, 00046");
  assert.deepEqual(Object.keys(rows[0]).slice(3, 6), [
    "Palettenscheinnummer", "Europaletten verladen", "Düsseldorfer verladen",
  ]);
  assert.deepEqual(buildExportRows([]), []);

  const headers = Object.keys(rows[0]) as (keyof typeof rows[number])[];
  const csv = headers.join(";") + "\r\n" + rows.map(r => headers.map(h => r[h]).join(";")).join("\r\n");
  assert.match(csv, /Palettenscheinnummer;Europaletten verladen;Düsseldorfer verladen;/);
  assert.match(csv, /00045, 00046;45;;/);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Verladungen");
  const reread = XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const exported = XLSX.utils.sheet_to_json(reread.Sheets.Verladungen, { defval: "" });
  assert.deepEqual(exported, rows);
});
