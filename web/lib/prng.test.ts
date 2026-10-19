import assert from "node:assert/strict";
import { test } from "node:test";
import { createRng } from "./prng";

function draw(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng());
}

test("the same seed gives the same sequence and different seeds differ", () => {
  assert.deepEqual(draw(42, 20), draw(42, 20));
  assert.notDeepEqual(draw(1, 5), draw(2, 5));
});

test("values stay in the range 0 up to but not including 1", () => {
  for (const value of draw(7, 10_000)) {
    assert.ok(value >= 0 && value < 1);
  }
});
