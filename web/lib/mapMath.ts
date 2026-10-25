import type { Address } from "viem";

/** World coordinates run from 0 to 400 in both directions, with the centre at (200, 200). */
export const WORLD_SIZE = 400;
export const WORLD_CENTER = WORLD_SIZE / 2;
export const INNER_RADIUS = 105;
export const OUTER_RADIUS = 165;
export const MAX_INNER = 6;
export const MIN_NODE_RADIUS = 3;
export const MAX_NODE_RADIUS = 14;
export const EDGE_ALPHA_MIN = 0.12;
export const EDGE_ALPHA_MAX = 0.85;
/** A swap that moves the price at least this much (basis points) gets an expanding ring. */
export const LARGE_IMPACT_BPS = 200;

export type Vec = { readonly x: number; readonly y: number };

export type NodeLayout = {
  readonly address: Address;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly ring: "inner" | "outer";
};

export type Rgb = readonly [number, number, number];

export const COLOR_NEUTRAL: Rgb = [110, 110, 110];
export const COLOR_BUY: Rgb = [245, 245, 245];
export const COLOR_SELL: Rgb = [214, 84, 84];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fixed ring layout, no simulation: the first tokens in the list (highest TVL) sit on the
 * inner ring, the rest on the outer ring, evenly spaced and starting at the top. The outer
 * ring is rotated half a step so its nodes sit between the inner ones.
 */
export function layoutNodes(order: readonly Address[], maxInner: number = MAX_INNER): NodeLayout[] {
  const innerCount = Math.min(maxInner, order.length);
  const outerCount = order.length - innerCount;
  return order.map((address, index): NodeLayout => {
    const inner = index < innerCount;
    const slot = inner ? index : index - innerCount;
    const count = inner ? innerCount : outerCount;
    const radius = inner ? INNER_RADIUS : OUTER_RADIUS;
    const offset = inner ? 0 : Math.PI / count;
    const angle = (2 * Math.PI * slot) / count + offset - Math.PI / 2;
    return {
      address,
      x: round2(WORLD_CENTER + radius * Math.cos(angle)),
      y: round2(WORLD_CENTER + radius * Math.sin(angle)),
      angle,
      ring: inner ? "inner" : "outer",
    };
  });
}

/** Node radius: its area follows TVL, between a minimum and a maximum size. */
export function nodeRadius(tvlUsd: number, maxTvlUsd: number): number {
  if (!(maxTvlUsd > 0) || !(tvlUsd > 0)) return MIN_NODE_RADIUS;
  const share = Math.min(1, tvlUsd / maxTvlUsd);
  return MIN_NODE_RADIUS + (MAX_NODE_RADIUS - MIN_NODE_RADIUS) * Math.sqrt(share);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

/** Grey when quiet, shading to white for net buying and to soft red for net selling. */
export function pressureColor(pressure: number): Rgb {
  if (!Number.isFinite(pressure) || pressure === 0) return COLOR_NEUTRAL;
  const amount = Math.sqrt(Math.min(1, Math.abs(pressure)));
  return mix(COLOR_NEUTRAL, pressure > 0 ? COLOR_BUY : COLOR_SELL, amount);
}

export function rgba(color: Rgb, alpha = 1): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** Opacity of a pool line: brighter with more window volume. */
export function edgeAlpha(volumeUsd: number, maxVolumeUsd: number): number {
  if (!(maxVolumeUsd > 0) || !(volumeUsd > 0)) return EDGE_ALPHA_MIN;
  const share = Math.min(1, volumeUsd / maxVolumeUsd);
  return EDGE_ALPHA_MIN + (EDGE_ALPHA_MAX - EDGE_ALPHA_MIN) * Math.sqrt(share);
}

/** Particle radius in world units: grows with the logarithm of the trade value. */
export function particleRadius(valueUsd: number | null): number {
  if (valueUsd === null || !(valueUsd > 0)) return 1.5;
  return Math.min(6, Math.max(1.5, 1.5 + 1.2 * Math.log10(1 + valueUsd / 100)));
}

export function isLargeTrade(priceImpactBps: number | null): boolean {
  return priceImpactBps !== null && priceImpactBps >= LARGE_IMPACT_BPS;
}

export const INTRO_STAGGER_MS = 60;
export const INTRO_NODE_MS = 700;
export const INTRO_EDGE_MS = 600;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Progress of one node's spawn animation, eased so it starts fast. Nodes start one after another. */
export function introNodeProgress(elapsedMs: number, index: number): number {
  const raw = clamp01((elapsedMs - index * INTRO_STAGGER_MS) / INTRO_NODE_MS);
  return 1 - (1 - raw) ** 3;
}

/** Progress of the pool lines fading in, which begins once the last node has landed. */
export function introEdgeProgress(elapsedMs: number, nodeCount: number): number {
  const start = Math.max(0, nodeCount - 1) * INTRO_STAGGER_MS + INTRO_NODE_MS;
  return clamp01((elapsedMs - start) / INTRO_EDGE_MS);
}

/** A coordinate moved toward the map centre: progress 0 is the centre, 1 is the real position. */
export function lerpFromCenter(value: number, progress: number): number {
  return WORLD_CENTER + (value - WORLD_CENTER) * progress;
}
