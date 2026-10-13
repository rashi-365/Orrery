import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  SIZE_BANDS,
  computeAmountIn,
  nextDelayMs,
  pickSizeClass,
  type SizeClass,
} from "./plan.ts";
import { createRng } from "./random.ts";

test("the delay between swaps stays within 1 to 4 seconds and uses the whole range", () => {
  const rng = createRng(5);
  let lowest = Number.POSITIVE_INFINITY;
  let highest = 0;
  for (let i = 0; i < 5000; i++) {
    const delay = nextDelayMs(rng);
    assert.ok(delay >= MIN_DELAY_MS && delay <= MAX_DELAY_MS);
    lowest = Math.min(lowest, delay);
    highest = Math.max(highest, delay);
  }
  assert.ok(lowest < 1500);
  assert.ok(highest > 3500);
});

test("the size mix is about 70 percent small, 25 medium and 5 large", () => {
  const rng = createRng(12345);
  const counts: Record<SizeClass, number> = { small: 0, medium: 0, large: 0 };
  const draws = 20_000;
  for (let i = 0; i < draws; i++) counts[pickSizeClass(rng)]++;
  assert.ok(Math.abs(counts.large / draws - 0.05) < 0.015);
  assert.ok(Math.abs(counts.medium / draws - 0.25) < 0.02);
  assert.ok(Math.abs(counts.small / draws - 0.7) < 0.02);
});

test("amounts stay inside the band of the chosen size class", () => {
  const rng = createRng(77);
  const reserve = 1_000_000_000_000n;
  for (const sizeClass of ["small", "medium", "large"] as const) {
    const band = SIZE_BANDS[sizeClass];
    const low = (reserve * BigInt(band.minBps)) / 10_000n;
    const high = (reserve * BigInt(band.maxBps)) / 10_000n;
    for (let i = 0; i < 500; i++) {
      const amount = computeAmountIn(reserve, sizeClass, rng);
      assert.ok(amount >= low && amount <= high);
      assert.ok(amount < reserve);
    }
  }
});

test("a dust-sized reserve gives a zero amount so the swap is skipped", () => {
  assert.equal(computeAmountIn(10n, "small", createRng(3)), 0n);
});
