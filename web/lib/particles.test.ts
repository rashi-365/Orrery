import assert from "node:assert/strict";
import { test } from "node:test";
import { SpritePool, spriteProgress, type Sprite } from "./particles";

function first(pool: SpritePool): Sprite {
  const sprite = pool.items[0];
  if (sprite === undefined) throw new Error("expected a sprite");
  return sprite;
}

test("a pool accepts sprites up to its capacity and then refuses", () => {
  const pool = new SpritePool(3);
  assert.equal(pool.spawn(0, 0, 10, 10, 2, 0, 0, 500), true);
  assert.equal(pool.spawn(0, 0, 10, 10, 2, 0, 0, 500), true);
  assert.equal(pool.spawn(0, 0, 10, 10, 2, 0, 0, 500), true);
  assert.equal(pool.spawn(0, 0, 10, 10, 2, 0, 0, 500), false);
  assert.equal(pool.activeCount, 3);
});

test("expire frees sprites whose time is up and keeps the others", () => {
  const pool = new SpritePool(2);
  pool.spawn(0, 0, 1, 1, 1, 0, 100, 50);
  pool.spawn(0, 0, 1, 1, 1, 0, 100, 500);
  pool.expire(149);
  assert.equal(pool.activeCount, 2);
  pool.expire(150);
  assert.equal(pool.activeCount, 1);
  pool.expire(600);
  assert.equal(pool.activeCount, 0);
});

test("a freed slot is reused without allocating a new object", () => {
  const pool = new SpritePool(1);
  const slot = first(pool);
  pool.spawn(1, 2, 3, 4, 5, 6, 0, 10);
  pool.expire(10);
  assert.equal(slot.active, false);
  assert.equal(pool.spawn(7, 8, 9, 10, 11, 12, 20, 30), true);
  assert.strictEqual(pool.items[0], slot);
  assert.equal(slot.active, true);
  assert.equal(slot.x0, 7);
});

test("sprites that start in the future are active but not yet visible", () => {
  const pool = new SpritePool(2);
  pool.spawn(0, 0, 1, 1, 1, 0, 1000, 100);
  assert.equal(pool.activeCount, 1);
  assert.equal(pool.visibleCount(999), 0);
  assert.equal(pool.visibleCount(1000), 1);
  assert.equal(pool.visibleCount(1099), 1);
  pool.expire(1100);
  assert.equal(pool.visibleCount(1100), 0);
});

test("spriteProgress runs from 0 to 1 over the duration and clamps outside it", () => {
  const pool = new SpritePool(2);
  pool.spawn(10, 20, 30, 40, 2, 8, 100, 200);
  const sprite = first(pool);
  assert.equal(sprite.x0, 10);
  assert.equal(sprite.y1, 40);
  assert.equal(sprite.size, 2);
  assert.equal(sprite.base, 8);
  assert.equal(spriteProgress(sprite, 50), 0);
  assert.equal(spriteProgress(sprite, 150), 0.25);
  assert.equal(spriteProgress(sprite, 200), 0.5);
  assert.equal(spriteProgress(sprite, 300), 1);
  assert.equal(spriteProgress(sprite, 1000), 1);

  pool.spawn(0, 0, 1, 1, 1, 0, 100, 0);
  const instant = pool.items[1];
  assert.ok(instant !== undefined);
  assert.equal(spriteProgress(instant, 100), 1);
});
