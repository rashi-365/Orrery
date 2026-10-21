import type { Address } from "viem";
import { pixelsPerUnit, type Camera, type View } from "./camera";
import {
  INNER_RADIUS,
  OUTER_RADIUS,
  WORLD_CENTER,
  edgeAlpha,
  nodeRadius,
  pressureColor,
  rgba,
  type NodeLayout,
} from "./mapMath";
import { FADE_STEPS, fadeLevel, spriteProgress, type SpritePool } from "./particles";
import type { PoolMeta, PoolStat, TokenStat } from "./stats";

const TAU = Math.PI * 2;
const LABEL_SIZE = 6.5;
const TICK_COUNT = 72;
const TICK_RING = 186;

// Colour strings for every fade step, built once, so drawing a particle creates no strings.
const alphaStyles = (peak: number): readonly string[] =>
  Array.from({ length: FADE_STEPS + 1 }, (_, i) => `rgba(255, 255, 255, ${(peak * i) / FADE_STEPS})`);
const TAIL_STYLES = alphaStyles(0.35);
const HEAD_STYLES = alphaStyles(0.95);
const RING_STYLES = alphaStyles(0.9);

/** Everything the canvas draws from. Updated in place by the map component. */
export type MapData = {
  layout: readonly NodeLayout[] | undefined;
  byAddress: Map<Address, NodeLayout>;
  stats: Map<Address, TokenStat>;
  poolStats: Map<Address, PoolStat>;
  maxTvl: number;
  maxVolume: number;
  hovered: Address | undefined;
  selected: Address | undefined;
};

export function createMapData(): MapData {
  return {
    layout: undefined,
    byAddress: new Map(),
    stats: new Map(),
    poolStats: new Map(),
    maxTvl: 0,
    maxVolume: 0,
    hovered: undefined,
    selected: undefined,
  };
}

export type FrameArgs = {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: View;
  readonly camera: Camera;
  readonly dpr: number;
  readonly time: number;
  readonly data: MapData;
  readonly pools: readonly PoolMeta[];
  readonly symbols: ReadonlyMap<Address, string>;
  readonly particles: SpritePool;
  readonly rings: SpritePool;
  readonly fontFamily: string;
};

function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

function neighborsOf(pools: readonly PoolMeta[], focus: Address): Set<Address> {
  const set = new Set<Address>([focus]);
  for (const pool of pools) {
    if (pool.token0 === focus) set.add(pool.token1);
    else if (pool.token1 === focus) set.add(pool.token0);
  }
  return set;
}

function drawOrbits(ctx: CanvasRenderingContext2D, hairline: number): void {
  ctx.lineWidth = hairline;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  for (const radius of [INNER_RADIUS, OUTER_RADIUS]) {
    ctx.beginPath();
    ctx.arc(WORLD_CENTER, WORLD_CENTER, radius, 0, TAU);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.beginPath();
  ctx.arc(WORLD_CENTER, WORLD_CENTER, TICK_RING, 0, TAU);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.beginPath();
  for (let i = 0; i < TICK_COUNT; i++) {
    const angle = (TAU * i) / TICK_COUNT;
    const outer = TICK_RING + (i % 6 === 0 ? 11 : 5);
    ctx.moveTo(WORLD_CENTER + Math.cos(angle) * TICK_RING, WORLD_CENTER + Math.sin(angle) * TICK_RING);
    ctx.lineTo(WORLD_CENTER + Math.cos(angle) * outer, WORLD_CENTER + Math.sin(angle) * outer);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.moveTo(WORLD_CENTER - 8, WORLD_CENTER);
  ctx.lineTo(WORLD_CENTER + 8, WORLD_CENTER);
  ctx.moveTo(WORLD_CENTER, WORLD_CENTER - 8);
  ctx.lineTo(WORLD_CENTER, WORLD_CENTER + 8);
  ctx.stroke();
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  data: MapData,
  pools: readonly PoolMeta[],
  focus: Address | undefined,
  hairline: number,
): void {
  ctx.lineWidth = hairline;
  for (const pool of pools) {
    const a = data.byAddress.get(pool.token0);
    const b = data.byAddress.get(pool.token1);
    if (a === undefined || b === undefined) continue;
    let alpha = edgeAlpha(data.poolStats.get(pool.address)?.volumeUsd ?? 0, data.maxVolume);
    if (focus !== undefined) {
      const connected = pool.token0 === focus || pool.token1 === focus;
      alpha = connected ? Math.max(alpha, 0.6) : alpha * 0.12;
    }
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: SpritePool, time: number): void {
  ctx.lineCap = "round";
  for (let i = 0; i < particles.items.length; i++) {
    const sprite = particles.items[i];
    if (sprite === undefined || !sprite.active || time < sprite.startAt) continue;
    const progress = spriteProgress(sprite, time);
    const level = fadeLevel(progress, FADE_STEPS);
    if (level === 0) continue;
    const eased = smoothstep(progress);
    const x = sprite.x0 + (sprite.x1 - sprite.x0) * eased;
    const y = sprite.y0 + (sprite.y1 - sprite.y0) * eased;
    const tail = Math.max(0, eased - 0.12);
    const tailX = sprite.x0 + (sprite.x1 - sprite.x0) * tail;
    const tailY = sprite.y0 + (sprite.y1 - sprite.y0) * tail;

    ctx.strokeStyle = TAIL_STYLES[level] ?? "transparent";
    ctx.lineWidth = sprite.size * 0.8;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = HEAD_STYLES[level] ?? "transparent";
    ctx.beginPath();
    ctx.arc(x, y, sprite.size, 0, TAU);
    ctx.fill();
  }
}

function drawRings(
  ctx: CanvasRenderingContext2D,
  rings: SpritePool,
  time: number,
  hairline: number,
): void {
  ctx.lineWidth = hairline * 1.5;
  for (let i = 0; i < rings.items.length; i++) {
    const sprite = rings.items[i];
    if (sprite === undefined || !sprite.active || time < sprite.startAt) continue;
    const progress = spriteProgress(sprite, time);
    const level = Math.round((1 - progress) * FADE_STEPS);
    if (level <= 0) continue;
    const eased = 1 - (1 - progress) * (1 - progress);
    ctx.strokeStyle = RING_STYLES[level] ?? "transparent";
    ctx.beginPath();
    ctx.arc(sprite.x0, sprite.y0, sprite.base + sprite.size * eased, 0, TAU);
    ctx.stroke();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  data: MapData,
  layout: readonly NodeLayout[],
  symbols: ReadonlyMap<Address, string>,
  focus: Address | undefined,
  neighbors: ReadonlySet<Address> | undefined,
  hairline: number,
  fontFamily: string,
): void {
  ctx.font = `${LABEL_SIZE}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  for (const node of layout) {
    const stat = data.stats.get(node.address);
    const radius = nodeRadius(stat?.tvlUsd ?? 0, data.maxTvl);
    const color = pressureColor(stat?.pressure ?? 0);
    const dim = neighbors !== undefined && !neighbors.has(node.address);

    ctx.fillStyle = rgba(color, dim ? 0.25 : 1);
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, TAU);
    ctx.fill();

    ctx.lineWidth = hairline;
    ctx.strokeStyle = rgba(color, dim ? 0.12 : 0.45);
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 3, 0, TAU);
    ctx.stroke();

    if (node.address === focus) {
      ctx.lineWidth = hairline * 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, TAU);
      ctx.stroke();
    }

    const symbol = symbols.get(node.address);
    if (symbol !== undefined) {
      const cos = Math.cos(node.angle);
      ctx.textAlign = cos > 0.25 ? "left" : cos < -0.25 ? "right" : "center";
      ctx.fillStyle = `rgba(228, 228, 228, ${dim ? 0.3 : 0.9})`;
      ctx.fillText(
        symbol,
        node.x + cos * (radius + 8),
        node.y + Math.sin(node.angle) * (radius + 8),
      );
    }
  }
}

/** Draws one frame of the map onto the canvas. */
export function drawFrame(args: FrameArgs): void {
  const { ctx, view, camera, dpr, time, data, pools, symbols, particles, rings, fontFamily } = args;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.width * dpr, view.height * dpr);

  const scale = pixelsPerUnit(view, camera.zoom);
  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    dpr * (view.width / 2 - camera.x * scale),
    dpr * (view.height / 2 - camera.y * scale),
  );
  const hairline = 1 / scale;

  drawOrbits(ctx, hairline);
  const layout = data.layout;
  if (layout === undefined) return;

  const focus = data.hovered ?? data.selected;
  const neighbors = focus === undefined ? undefined : neighborsOf(pools, focus);
  drawEdges(ctx, data, pools, focus, hairline);
  drawParticles(ctx, particles, time);
  drawRings(ctx, rings, time, hairline);
  drawNodes(ctx, data, layout, symbols, focus, neighbors, hairline, fontFamily);
}
