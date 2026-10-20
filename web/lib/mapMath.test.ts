import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import {
  COLOR_BUY,
  COLOR_NEUTRAL,
  COLOR_SELL,
  INNER_RADIUS,
  OUTER_RADIUS,
  WORLD_CENTER,
  edgeAlpha,
  isLargeTrade,
  layoutNodes,
  nodeRadius,
  particleRadius,
  pressureColor,
  rgba,
} from "./mapMath";

const addr = (n: number): Address => `0x${n.toString().padStart(40, "0")}`;

function approx(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);
}

function distanceFromCenter(x: number, y: number): number {
  return Math.hypot(x - WORLD_CENTER, y - WORLD_CENTER);
}

test("sixteen tokens fill an inner ring of six and an outer ring of ten, in the given order", () => {
  const order = Array.from({ length: 16 }, (_, i) => addr(i + 1));
  const layout = layoutNodes(order);
  assert.equal(layout.length, 16);
  assert.deepEqual(
    layout.map((node) => node.address),
    order,
  );
  layout.slice(0, 6).forEach((node) => {
    assert.equal(node.ring, "inner");
    approx(distanceFromCenter(node.x, node.y), INNER_RADIUS, 0.02);
  });
  layout.slice(6).forEach((node) => {
    assert.equal(node.ring, "outer");
    approx(distanceFromCenter(node.x, node.y), OUTER_RADIUS, 0.02);
  });
  const top = layout[0];
  const firstOuter = layout[6];
  assert.ok(top !== undefined && firstOuter !== undefined);
  approx(top.x, 200, 0.011);
  approx(top.y, 95, 0.011);
  // The outer ring is turned half a step, so its first node sits 18 degrees right of the top.
  approx(firstOuter.x, 250.99, 0.011);
  approx(firstOuter.y, 43.08, 0.011);
  assert.deepEqual(layoutNodes(order), layout);
});

test("small token counts use only the inner ring and an empty list gives an empty layout", () => {
  const layout = layoutNodes([addr(1), addr(2), addr(3)]);
  assert.ok(layout.every((node) => node.ring === "inner"));
  const second = layout[1];
  const third = layout[2];
  assert.ok(second !== undefined && third !== undefined);
  approx(second.x, 290.93, 0.011);
  approx(second.y, 252.5, 0.011);
  approx(third.x, 109.07, 0.011);
  approx(third.y, 252.5, 0.011);

  const single = layoutNodes([addr(1)]);
  approx(single[0]?.x ?? Number.NaN, 200, 0.011);
  approx(single[0]?.y ?? Number.NaN, 95, 0.011);
  assert.deepEqual(layoutNodes([]), []);
});

test("node radius follows the square root of TVL between the minimum and maximum size", () => {
  assert.equal(nodeRadius(0, 100), 3);
  assert.equal(nodeRadius(100, 100), 14);
  approx(nodeRadius(25, 100), 8.5);
  assert.equal(nodeRadius(200, 100), 14);
  assert.equal(nodeRadius(50, 0), 3);
  assert.equal(nodeRadius(Number.NaN, 100), 3);
});

test("pressure colour is grey when quiet, white for buying and amber for selling", () => {
  assert.deepEqual(pressureColor(0), COLOR_NEUTRAL);
  assert.deepEqual(pressureColor(Number.NaN), COLOR_NEUTRAL);
  assert.deepEqual(pressureColor(1), COLOR_BUY);
  assert.deepEqual(pressureColor(5), COLOR_BUY);
  assert.deepEqual(pressureColor(-1), COLOR_SELL);
  assert.deepEqual(pressureColor(0.25), [178, 178, 178]);
  assert.deepEqual(pressureColor(-0.25), [176, 137, 84]);
  assert.equal(rgba([1, 2, 3], 0.5), "rgba(1, 2, 3, 0.5)");
  assert.equal(rgba([1, 2, 3]), "rgba(1, 2, 3, 1)");
});

test("pool lines get brighter with volume between a faint floor and a strong ceiling", () => {
  approx(edgeAlpha(0, 100), 0.12);
  approx(edgeAlpha(100, 100), 0.85);
  approx(edgeAlpha(25, 100), 0.485);
  approx(edgeAlpha(500, 100), 0.85);
  approx(edgeAlpha(10, 0), 0.12);
});

test("particle radius grows with trade value and is capped, and large trades are those at 2 percent impact", () => {
  assert.equal(particleRadius(null), 1.5);
  assert.equal(particleRadius(0), 1.5);
  approx(particleRadius(1000), 2.75, 0.01);
  approx(particleRadius(100_000), 5.1, 0.01);
  assert.equal(particleRadius(1e9), 6);

  assert.equal(isLargeTrade(null), false);
  assert.equal(isLargeTrade(199), false);
  assert.equal(isLargeTrade(200), true);
  assert.equal(isLargeTrade(900), true);
});
