import test from "node:test";
import assert from "node:assert/strict";
import {
  centsToNumber,
  centsToNumericString,
  toCents,
} from "../src/utils/money.js";

test("toCents parses string amounts exactly", () => {
  assert.equal(toCents("10.25"), 1025n);
  assert.equal(toCents("0.01"), 1n);
});

test("toCents rejects malformed amounts", () => {
  assert.throws(() => toCents("10.999"));
  assert.throws(() => toCents("abc"));
  assert.throws(() => toCents(0));
});

test("centsToNumericString and centsToNumber keep 2-decimal precision", () => {
  assert.equal(centsToNumericString(12345n), "123.45");
  assert.equal(centsToNumber(12345n), 123.45);
});
