import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatCount, formatDeltaPct, formatUsd, shortHash } from "./display";

test("formatUsd abbreviates large values and keeps cents for small ones", () => {
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(0.003), "<$0.01");
  assert.equal(formatUsd(0.5), "$0.50");
  assert.equal(formatUsd(12.34567), "$12.35");
  assert.equal(formatUsd(999.994), "$999.99");
  assert.equal(formatUsd(1500), "$1.50K");
  assert.equal(formatUsd(456_700), "$456.70K");
  assert.equal(formatUsd(1_234_567), "$1.23M");
  assert.equal(formatUsd(2.5e9), "$2.50B");
  assert.equal(formatUsd(3e12), "$3.00T");
  assert.equal(formatUsd(Number.NaN), "--");
});

test("formatCount adds thousands separators and rounds", () => {
  assert.equal(formatCount(1_234_567), "1,234,567");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(2.6), "3");
});

test("formatDeltaPct signs the change, rounds tiny moves to zero and handles no baseline", () => {
  assert.equal(formatDeltaPct(null), "--");
  assert.equal(formatDeltaPct(12.34), "+12.3%");
  assert.equal(formatDeltaPct(-4.56), "-4.6%");
  assert.equal(formatDeltaPct(0.01), "0.0%");
  assert.equal(formatDeltaPct(100), "+100.0%");
  assert.equal(formatDeltaPct(-100), "-100.0%");
  assert.equal(formatDeltaPct(5000), ">+999%");
  assert.equal(formatDeltaPct(Number.NaN), "--");
});

test("formatClock prints local HH:MM:SS and shortHash keeps ten characters", () => {
  const local = new Date(2026, 0, 1, 13, 5, 9).getTime() / 1000;
  assert.equal(formatClock(local), "13:05:09");
  assert.equal(shortHash(`0x${"ab".repeat(32)}`), "0xabababab");
});
