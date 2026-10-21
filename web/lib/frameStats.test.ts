import assert from "node:assert/strict";
import { test } from "node:test";
import { FrameMeter } from "./frameStats";

function approx(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error("expected a summary");
  return value;
}

test("a meter has no summary until a frame is recorded, and reset clears it", () => {
  const meter = new FrameMeter(4);
  assert.equal(meter.summary(), null);
  meter.record(10);
  assert.notEqual(meter.summary(), null);
  meter.reset();
  assert.equal(meter.summary(), null);
});

test("steady 16 ms frames give 62.5 fps and no slow frames", () => {
  const meter = new FrameMeter();
  for (let i = 0; i < 100; i++) meter.record(16);
  const summary = must(meter.summary());
  assert.equal(summary.frames, 100);
  assert.equal(summary.fps, 62.5);
  assert.equal(summary.avgMs, 16);
  assert.equal(summary.p95Ms, 16);
  assert.equal(summary.worstMs, 16);
  assert.equal(summary.slowFrames, 0);
});

test("a few long frames show in the worst case and slow count but not in the 95th percentile", () => {
  const meter = new FrameMeter();
  for (let i = 0; i < 95; i++) meter.record(10);
  for (let i = 0; i < 5; i++) meter.record(40);
  const summary = must(meter.summary());
  assert.equal(summary.frames, 100);
  approx(summary.avgMs, 11.5);
  approx(summary.fps, 1000 / 11.5, 1e-3);
  assert.equal(summary.p95Ms, 10);
  assert.equal(summary.worstMs, 40);
  assert.equal(summary.slowFrames, 5);
});

test("the meter keeps only the most recent frames and rejects a bad size", () => {
  const meter = new FrameMeter(4);
  for (const value of [1, 2, 3, 4, 5, 6]) meter.record(value);
  const summary = must(meter.summary());
  assert.equal(summary.frames, 4);
  approx(summary.avgMs, 4.5);
  assert.equal(summary.worstMs, 6);
  assert.equal(summary.p95Ms, 6);
  assert.throws(() => new FrameMeter(0), /capacity/);
});
