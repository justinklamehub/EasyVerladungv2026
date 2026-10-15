import { test } from "node:test";
import assert from "node:assert/strict";
import { CreateClockEmployeeBody, UpdateClockEmployeeBody, PreviewClockImportBody } from "@workspace/api-zod";
import { formatClockCardNumber, assertClockCardUnchanged, assertAutomaticClockCardNumber } from "./employee-numbers";

test("card numbers retain the existing M plus eight digits format", () => {
  assert.equal(formatClockCardNumber(26000030), "M26000030");
  assert.equal(formatClockCardNumber(1), "M00000001");
  assert.equal(formatClockCardNumber(99999999), "M99999999");
});
test("exhaustion and invalid numbers cannot silently change the card format", () => {
  for (const n of [0, -1, 100000000, 1.5, NaN]) assert.throws(() => formatClockCardNumber(n));
});
test("employee creation requires no client-assigned card number", () => {
  const body = { firstName: "Test", lastName: "Test", provider: "", activity: "", active: true };
  assert.deepEqual(CreateClockEmployeeBody.parse(body), body);
  assert.doesNotThrow(() => assertAutomaticClockCardNumber(body));
  for (const cardNumber of ["M26000030", "JK01", "", null])
    assert.throws(() => assertAutomaticClockCardNumber({ ...body, cardNumber }));
});
test("editing or toggling active status preserves both standard and legacy cards", () => {
  for (const number of ["M26000001", "JK01"]) {
    assert.doesNotThrow(() => assertClockCardUnchanged(number, number));
    assert.throws(() => assertClockCardUnchanged(number, "M26000030"));
    assert.equal(UpdateClockEmployeeBody.parse({ cardNumber: number, firstName: "Test", lastName: "Test", provider: "", activity: "", active: false }).cardNumber, number);
  }
});
test("legacy imports continue accepting original card numbers", () => {
  const data = PreviewClockImportBody.parse({ employees: [{ cardNumber: "JK01", firstName: "Test", lastName: "Test", provider: "", activity: "", active: false }], entries: [], legacyTimesAcknowledged: true });
  assert.equal(data.employees[0].cardNumber, "JK01");
});
