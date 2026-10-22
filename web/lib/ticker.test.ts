import assert from "node:assert/strict";
import { test } from "node:test";
import { easeOutCubic, interpolate } from "./ticker";

test("easeOutCubic runs from 0 to 1, starts fast, and clamps its input", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(0.5), 0.875);
  assert.equal(easeOutCubic(-3), 0);
  assert.equal(easeOutCubic(7), 1);
});

test("interpolate moves from the start value to the target along the curve, up or down", () => {
  assert.equal(interpolate(10, 20, 0), 10);
  assert.equal(interpolate(10, 20, 1), 20);
  assert.equal(interpolate(10, 20, 0.5), 18.75);
  assert.equal(interpolate(20, 10, 0.5), 11.25);
  assert.equal(interpolate(5, 5, 0.3), 5);
});
