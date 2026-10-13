import assert from "node:assert/strict";
import { test } from "node:test";
import { createRng, pickOne, randomInt } from "./random.ts";

function draw(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng());
}

test("the same seed produces the same sequence", () => {
  assert.deepEqual(draw(42, 20), draw(42, 20));
});

test("different seeds produce different sequences", () => {
  assert.notDeepEqual(draw(1, 5), draw(2, 5));
});

test("values stay in the range 0 up to but not including 1", () => {
  for (const value of draw(7, 10_000)) {
    assert.ok(value >= 0 && value < 1);
  }
});

test("randomInt covers both inclusive bounds and nothing outside them", () => {
  const rng = createRng(99);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) seen.add(randomInt(rng, 3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test("pickOne rejects an empty list", () => {
  assert.throws(() => pickOne(createRng(1), []), /empty/);
});
