import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INERTIA_TAU_MS,
  INITIAL_CAMERA,
  blendVelocity,
  clampPan,
  decayVelocity,
  hitTest,
  isMoving,
  panBy,
  pixelsPerUnit,
  screenToWorld,
  worldToScreen,
  zoomBy,
  type View,
} from "./camera";

const VIEW: View = { width: 440, height: 440 };

function approx(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);
}

test("world and screen coordinates convert both ways", () => {
  assert.equal(pixelsPerUnit({ width: 880, height: 440 }, 1), 1);
  assert.deepEqual(worldToScreen({ x: 200, y: 200 }, INITIAL_CAMERA, VIEW), { x: 220, y: 220 });
  assert.deepEqual(worldToScreen({ x: 300, y: 200 }, INITIAL_CAMERA, VIEW), { x: 320, y: 220 });
  const zoomed = { ...INITIAL_CAMERA, zoom: 2 };
  assert.deepEqual(worldToScreen({ x: 300, y: 200 }, zoomed, VIEW), { x: 420, y: 220 });

  const camera = { x: 150, y: 260, zoom: 1.7 };
  const view: View = { width: 800, height: 500 };
  const back = screenToWorld(worldToScreen({ x: 123, y: 45 }, camera, view), camera, view);
  approx(back.x, 123);
  approx(back.y, 45);
});

test("zoom is clamped to its limits", () => {
  assert.equal(zoomBy(INITIAL_CAMERA, 1.25).zoom, 1.25);
  assert.equal(zoomBy({ ...INITIAL_CAMERA, zoom: 3.5 }, 1.25).zoom, 4);
  assert.equal(zoomBy({ ...INITIAL_CAMERA, zoom: 0.7 }, 0.5).zoom, 0.6);
});

test("dragging moves the camera the opposite way, scaled by zoom", () => {
  const moved = panBy(INITIAL_CAMERA, 10, -20, VIEW);
  assert.equal(moved.x, 190);
  assert.equal(moved.y, 220);
  assert.equal(panBy({ ...INITIAL_CAMERA, zoom: 2 }, 10, 0, VIEW).x, 195);
});

test("panning cannot carry the camera far from the map", () => {
  const far = panBy(INITIAL_CAMERA, -100_000, 100_000, VIEW);
  assert.equal(far.x, 460);
  assert.equal(far.y, -60);
  const inside = { x: 250, y: 150, zoom: 1 };
  assert.deepEqual(clampPan(inside), inside);
});

test("velocity decays exponentially and stops counting as movement", () => {
  const slowed = decayVelocity({ x: 1, y: -2 }, INERTIA_TAU_MS);
  approx(slowed.x, Math.exp(-1), 1e-9);
  approx(slowed.y, -2 * Math.exp(-1), 1e-9);
  assert.equal(isMoving({ x: 0.01, y: 0 }), false);
  assert.equal(isMoving({ x: 0.03, y: 0 }), true);
  assert.equal(isMoving({ x: 0.015, y: 0.015 }), true);
  assert.equal(isMoving(decayVelocity({ x: 1, y: 0 }, 5000)), false);
});

test("blendVelocity mixes the latest movement into the previous speed", () => {
  const first = blendVelocity({ x: 0, y: 0 }, 10, -5, 10);
  approx(first.x, 0.7);
  approx(first.y, -0.35);
  const steady = blendVelocity({ x: 1, y: 1 }, 10, 10, 10);
  approx(steady.x, 1);
  approx(steady.y, 1);
  const previous = { x: 3, y: 4 };
  assert.strictEqual(blendVelocity(previous, 10, 10, 0), previous);
});

test("hitTest picks the nearest target inside its circle plus slack", () => {
  const targets = [
    { id: "a", x: 100, y: 100, radius: 10 },
    { id: "b", x: 130, y: 100, radius: 10 },
  ];
  assert.equal(hitTest(targets, { x: 112, y: 100 }), "a");
  assert.equal(hitTest(targets, { x: 119, y: 100 }), "b");
  assert.equal(hitTest(targets, { x: 120, y: 100 }), "b");
  assert.equal(hitTest(targets, { x: 115, y: 100 }), null);
  assert.equal(hitTest(targets, { x: 115, y: 100 }, 10), "a");
  assert.equal(hitTest(targets, { x: 500, y: 500 }), null);
  assert.equal(hitTest([], { x: 0, y: 0 }), null);
});
