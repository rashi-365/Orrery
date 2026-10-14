import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAmount, formatBps, parseAmount, parseSlippagePercent } from "./amount";

test("parseAmount reads plain, leading-dot and trailing-dot decimals", () => {
  assert.equal(parseAmount("1.5", 6), 1_500_000n);
  assert.equal(parseAmount("0.000001", 6), 1n);
  assert.equal(parseAmount(".5", 6), 500_000n);
  assert.equal(parseAmount("5.", 6), 5_000_000n);
  assert.equal(parseAmount("12", 0), 12n);
  assert.equal(parseAmount("0", 18), 0n);
});

test("parseAmount rejects empty, malformed and over-precise input", () => {
  assert.equal(parseAmount("", 6), null);
  assert.equal(parseAmount(".", 6), null);
  assert.equal(parseAmount("1.2.3", 6), null);
  assert.equal(parseAmount("abc", 6), null);
  assert.equal(parseAmount("-1", 6), null);
  assert.equal(parseAmount("1.1234567", 6), null);
  assert.equal(parseAmount("1.5", 0), null);
});

test("formatAmount groups thousands, trims zeros and truncates the fraction", () => {
  assert.equal(formatAmount(1_234_567_890n, 6), "1,234.56789");
  assert.equal(formatAmount(1_500_000n, 6), "1.5");
  assert.equal(formatAmount(1_000_000n, 6), "1");
  assert.equal(formatAmount(10n ** 24n, 18), "1,000,000");
  assert.equal(formatAmount(123_456_789_012_345_678n, 18), "0.123456");
});

test("formatAmount shows zero and flags amounts too small to display", () => {
  assert.equal(formatAmount(0n, 18), "0");
  assert.equal(formatAmount(1n, 18), "<0.000001");
  assert.equal(formatAmount(1n, 6), "0.000001");
});

test("formatBps prints a percentage with two decimals", () => {
  assert.equal(formatBps(30), "0.30");
  assert.equal(formatBps(0), "0.00");
  assert.equal(formatBps(5), "0.05");
  assert.equal(formatBps(1500), "15.00");
  assert.equal(formatBps(4992), "49.92");
});

test("parseSlippagePercent converts percentages inside the allowed range", () => {
  assert.equal(parseSlippagePercent("0.5"), 50);
  assert.equal(parseSlippagePercent("1"), 100);
  assert.equal(parseSlippagePercent("5"), 500);
  assert.equal(parseSlippagePercent("0.01"), 1);
  assert.equal(parseSlippagePercent("2.25"), 225);
});

test("parseSlippagePercent rejects out-of-range and malformed input", () => {
  assert.equal(parseSlippagePercent("5.01"), null);
  assert.equal(parseSlippagePercent("6"), null);
  assert.equal(parseSlippagePercent("0"), null);
  assert.equal(parseSlippagePercent(""), null);
  assert.equal(parseSlippagePercent("abc"), null);
  assert.equal(parseSlippagePercent("0.001"), null);
  assert.equal(parseSlippagePercent("1."), null);
  assert.equal(parseSlippagePercent(".5"), null);
});
