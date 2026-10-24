"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Address } from "viem";
import {
  INITIAL_CAMERA,
  ZERO_VELOCITY,
  ZOOM_STEP,
  blendVelocity,
  decayVelocity,
  hitTest,
  isMoving,
  panBy,
  pixelsPerUnit,
  worldToScreen,
  zoomBy,
  type Camera,
  type HitTarget,
  type Velocity,
  type View,
} from "@/lib/camera";
import { formatClock, formatUsd } from "@/lib/display";
import { recentSwapsForToken, type SwapEvent } from "@/lib/events";
import { isLargeTrade, layoutNodes, nodeRadius, particleRadius, type Vec } from "@/lib/mapMath";
import { createMapData, drawFrame, type DisplayNode } from "@/lib/mapRender";
import { MARKET, TOKENS_BY_ADDRESS } from "@/lib/market";
import { FrameMeter } from "@/lib/frameStats";
import { SpritePool } from "@/lib/particles";
import { createRng } from "@/lib/prng";
import { swapValueUsd, unitsToNumber, type TokenStat, type WindowKey } from "@/lib/stats";
import { usePoolStats, useTokenStats } from "@/lib/useMarketStats";
import { useMarketData } from "./MarketDataProvider";
import { PerfOverlay } from "./PerfOverlay";
import { SelectionCard, type CardPool, type CardTrade } from "./SelectionCard";

const PARTICLE_CAPACITY = 300;
const RING_CAPACITY = 64;
const TRAVEL_MS = 1100;
const RING_MS = 800;
const RING_EXTRA = 26;
const PULSE_MS = 700;
const PULSE_EXTRA = 12;
const SPAWN_GAP_MS = 60;
const DRAG_THRESHOLD_PX = 4;
const INERTIA_IDLE_MS = 80;
const TOOLTIP_WIDTH = 176;
const STRESS_RINGS = 40;

type DragState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  moved: boolean;
};

type NetworkMapProps = {
  readonly windowKey: WindowKey;
  readonly selected: Address | undefined;
  readonly onSelect: (token: Address | undefined) => void;
};

/** Dollar value of a swap, taken from the live token prices. */
function swapUsd(swap: SwapEvent, stats: ReadonlyMap<Address, TokenStat>): number | null {
  const sides = [
    [swap.tokenIn, swap.amountIn],
    [swap.tokenOut, swap.amountOut],
  ] as const;
  for (const [address, amount] of sides) {
    const token = TOKENS_BY_ADDRESS.get(address);
    const price = stats.get(address)?.priceUsd;
    if (token !== undefined && price !== undefined && price !== null) {
      return unitsToNumber(amount, token.decimals) * price;
    }
  }
  return null;
}

function MapButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 rounded-full border border-white/15 bg-black/40 font-mono text-data text-text backdrop-blur-md transition hover:border-white/60 hover:text-white hover:shadow-[0_0_14px_rgba(255,255,255,0.25)]"
    >
      {children}
    </button>
  );
}

function LegendRow({ swatch, children }: { readonly swatch: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${swatch}`} />
      {children}
    </div>
  );
}

function TipRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

/**
 * The live network map. Tokens sit on a fixed ring, sized by liquidity and coloured by net
 * buying or selling pressure. Pool lines brighten with volume, and each new swap sends a
 * particle along its pool, with a ring at the destination for large trades.
 */
export function NetworkMap({ windowKey, selected, onSelect }: NetworkMapProps) {
  const stats = useTokenStats(windowKey);
  const poolStats = usePoolStats(windowKey);
  const { swaps, subscribe } = useMarketData();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(INITIAL_CAMERA);
  const velocityRef = useRef<Velocity>(ZERO_VELOCITY);
  const viewRef = useRef<View>({ width: 0, height: 0 });
  const dragRef = useRef<DragState | null>(null);
  const pointerRef = useRef<Vec>({ x: 0, y: 0 });
  const nextSlotRef = useRef(0);
  const stressRef = useRef(false);
  const meter = useMemo(() => new FrameMeter(), []);
  const stressRng = useMemo(() => createRng(7), []);
  const [perfVisible, setPerfVisible] = useState(false);
  const [stressOn, setStressOn] = useState(false);

  // The profiling tools stay hidden unless the address ends in ?perf.
  useEffect(() => {
    setPerfVisible(new URLSearchParams(window.location.search).has("perf"));
  }, []);

  const data = useMemo(createMapData, []);
  const particles = useMemo(() => new SpritePool(PARTICLE_CAPACITY), []);
  const rings = useMemo(() => new SpritePool(RING_CAPACITY), []);
  const symbols = useMemo(
    () => new Map(MARKET.tokens.map((token) => [token.address, token.symbol] as const)),
    [],
  );
  const poolLabels = useMemo(
    () => new Map(MARKET.pools.map((pool) => [pool.address, pool.label] as const)),
    [],
  );
  const [hovered, setHovered] = useState<Address | undefined>(undefined);

  // Follow the reduced-motion setting: with it on, the intro is skipped.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    data.reduceMotion = query.matches;
    const onChange = () => {
      data.reduceMotion = query.matches;
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [data]);

  // Keep the drawing data in step with the latest statistics and selection.
  useEffect(() => {
    data.selected = selected;
    if (stats === undefined) return;
    data.stats = new Map(stats.map((stat) => [stat.token.address, stat] as const));
    data.maxTvl = stats.reduce((max, stat) => Math.max(max, stat.tvlUsd), 0);
    if (data.layout === undefined) {
      // Decided once, when the data first arrives, so nodes never jump between slots.
      const order = [...stats]
        .sort((a, b) => b.tvlUsd - a.tvlUsd || a.token.symbol.localeCompare(b.token.symbol))
        .map((stat) => stat.token.address);
      const layout = layoutNodes(order);
      data.layout = layout;
      data.byAddress = new Map(layout.map((node) => [node.address, node] as const));
      data.display = new Map(
        layout.map((node): [Address, DisplayNode] => [node.address, { x: node.x, y: node.y, p: 1 }]),
      );
      data.introStart = data.reduceMotion ? undefined : performance.now();
    }
    if (poolStats !== undefined) {
      data.poolStats = new Map(poolStats.map((stat) => [stat.pool.address, stat] as const));
      data.maxVolume = poolStats.reduce((max, stat) => Math.max(max, stat.volumeUsd), 0);
    }
  }, [data, stats, poolStats, selected]);

  // Turn each new live swap into a travelling particle, plus a ring for large trades.
  useEffect(() => {
    return subscribe((fresh) => {
      if (data.layout === undefined) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      for (const swap of fresh) {
        const from = data.byAddress.get(swap.tokenIn);
        const to = data.byAddress.get(swap.tokenOut);
        if (from === undefined || to === undefined) continue;

        const startAt = Math.max(performance.now(), nextSlotRef.current);
        nextSlotRef.current = startAt + SPAWN_GAP_MS;
        const fromRadius = nodeRadius(data.stats.get(swap.tokenIn)?.tvlUsd ?? 0, data.maxTvl);
        const toRadius = nodeRadius(data.stats.get(swap.tokenOut)?.tvlUsd ?? 0, data.maxTvl);

        if (reduceMotion) {
          rings.spawn(from.x, from.y, from.x, from.y, PULSE_EXTRA, fromRadius, startAt, PULSE_MS);
          rings.spawn(to.x, to.y, to.x, to.y, PULSE_EXTRA, toRadius, startAt, PULSE_MS);
          continue;
        }
        const size = particleRadius(swapUsd(swap, data.stats));
        particles.spawn(from.x, from.y, to.x, to.y, size, 0, startAt, TRAVEL_MS);
        if (isLargeTrade(swap.priceImpactBps)) {
          rings.spawn(to.x, to.y, to.x, to.y, RING_EXTRA, toRadius, startAt + TRAVEL_MS, RING_MS);
        }
      }
    });
  }, [subscribe, data, particles, rings]);

  // The render loop: size the canvas, glide after a drag, retire finished sprites, draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const context = ctx;
    const fontFamily =
      getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim() ||
      "monospace";

    let dpr = 1;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      viewRef.current = { width: rect.width, height: rect.height };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Profiling only: keeps the pools full so the worst case can be measured.
    const refillStress = (time: number): void => {
      const layout = data.layout;
      if (layout === undefined) return;
      const pools = MARKET.pools;
      while (particles.activeCount < PARTICLE_CAPACITY) {
        const pool = pools[Math.floor(stressRng() * pools.length)];
        if (pool === undefined) return;
        const forward = stressRng() < 0.5;
        const from = data.byAddress.get(forward ? pool.token0 : pool.token1);
        const to = data.byAddress.get(forward ? pool.token1 : pool.token0);
        if (from === undefined || to === undefined) return;
        const duration = TRAVEL_MS * (0.7 + stressRng() * 0.6);
        particles.spawn(from.x, from.y, to.x, to.y, 1.5 + stressRng() * 4, 0, time, duration);
      }
      while (rings.activeCount < STRESS_RINGS) {
        const node = layout[Math.floor(stressRng() * layout.length)];
        if (node === undefined) return;
        const duration = RING_MS * (0.7 + stressRng() * 0.6);
        rings.spawn(node.x, node.y, node.x, node.y, RING_EXTRA, 6, time, duration);
      }
    };

    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const rawDt = time - last;
      const dt = Math.min(64, Math.max(0, rawDt));
      last = time;
      if (rawDt > 0 && rawDt < 1000) meter.record(rawDt);
      if (stressRef.current) refillStress(time);
      if (dragRef.current === null && isMoving(velocityRef.current)) {
        cameraRef.current = panBy(
          cameraRef.current,
          velocityRef.current.x * dt,
          velocityRef.current.y * dt,
          viewRef.current,
        );
        velocityRef.current = decayVelocity(velocityRef.current, dt);
      }
      particles.expire(time);
      rings.expire(time);
      drawFrame({
        ctx: context,
        view: viewRef.current,
        camera: cameraRef.current,
        dpr,
        time,
        data,
        pools: MARKET.pools,
        symbols,
        particles,
        rings,
        fontFamily,
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [data, particles, rings, symbols, meter, stressRng]);

  // Escape clears the selection.
  useEffect(() => {
    if (selected === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelect(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, onSelect]);

  const positionTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    const container = containerRef.current;
    if (tooltip === null || container === null) return;
    const width = tooltip.offsetWidth || TOOLTIP_WIDTH;
    const x = Math.min(pointerRef.current.x + 14, container.clientWidth - width - 8);
    const y = Math.min(pointerRef.current.y + 14, container.clientHeight - tooltip.offsetHeight - 8);
    tooltip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }, []);

  useEffect(() => {
    positionTooltip();
  }, [hovered, positionTooltip]);

  const hitAt = (point: Vec): Address | undefined => {
    const layout = data.layout;
    if (layout === undefined) return undefined;
    const view = viewRef.current;
    const camera = cameraRef.current;
    const scale = pixelsPerUnit(view, camera.zoom);
    const targets: HitTarget<Address>[] = layout.map((node) => {
      const screen = worldToScreen(node, camera, view);
      return {
        id: node.address,
        x: screen.x,
        y: screen.y,
        radius: nodeRadius(data.stats.get(node.address)?.tvlUsd ?? 0, data.maxTvl) * scale,
      };
    });
    return hitTest(targets, point) ?? undefined;
  };

  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Vec => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    velocityRef.current = ZERO_VELOCITY;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event);
    pointerRef.current = point;
    const drag = dragRef.current;
    if (drag !== null && drag.pointerId === event.pointerId) {
      const now = performance.now();
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX
      ) {
        drag.moved = true;
        event.currentTarget.style.cursor = "grabbing";
      }
      if (drag.moved) {
        cameraRef.current = panBy(cameraRef.current, dx, dy, viewRef.current);
        velocityRef.current = blendVelocity(velocityRef.current, dx, dy, now - drag.lastTime);
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastTime = now;
      return;
    }
    const hit = hitAt(point);
    data.hovered = hit;
    setHovered(hit);
    event.currentTarget.style.cursor = hit === undefined ? "grab" : "pointer";
    positionTooltip();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) {
      const hit = hitAt(localPoint(event));
      onSelect(hit === undefined || hit === selected ? undefined : hit);
      return;
    }
    if (performance.now() - drag.lastTime > INERTIA_IDLE_MS) velocityRef.current = ZERO_VELOCITY;
    event.currentTarget.style.cursor = "grab";
  };

  const onPointerCancel = () => {
    dragRef.current = null;
  };

  const onPointerLeave = () => {
    if (dragRef.current !== null) return;
    data.hovered = undefined;
    setHovered(undefined);
  };

  const resetView = () => {
    cameraRef.current = INITIAL_CAMERA;
    velocityRef.current = ZERO_VELOCITY;
  };

  const hoveredStat = hovered === undefined ? undefined : stats?.find((s) => s.token.address === hovered);
  const selectedStat = selected === undefined ? undefined : stats?.find((s) => s.token.address === selected);

  const cardPools = useMemo<CardPool[]>(() => {
    if (selected === undefined || poolStats === undefined) return [];
    return poolStats
      .filter((stat) => stat.pool.token0 === selected || stat.pool.token1 === selected)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .map((stat) => ({
        id: stat.pool.address,
        label: poolLabels.get(stat.pool.address) ?? "?",
        tvlUsd: stat.tvlUsd,
        volumeUsd: stat.volumeUsd,
      }));
  }, [selected, poolStats, poolLabels]);

  const cardTrades = useMemo<CardTrade[]>(() => {
    if (selected === undefined || stats === undefined) return [];
    const prices = new Map<Address, number>();
    for (const stat of stats) {
      if (stat.priceUsd !== null) prices.set(stat.token.address, stat.priceUsd);
    }
    const tokenMap = new Map(MARKET.tokens.map((token) => [token.address, token] as const));
    return recentSwapsForToken(swaps, selected, 5).map((swap) => ({
      id: swap.id,
      time: formatClock(swap.timestamp),
      route: `${symbols.get(swap.tokenIn) ?? "?"} > ${symbols.get(swap.tokenOut) ?? "?"}`,
      valueUsd: swapValueUsd(swap, tokenMap, prices),
    }));
  }, [selected, stats, swaps, symbols]);

  return (
    <div ref={containerRef} className="relative h-[420px] w-full overflow-hidden sm:h-[540px]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Network map. Each dot is a token, sized by liquidity and coloured by buying or selling pressure. Each line is a pool."
        className="absolute inset-0 h-full w-full cursor-grab touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
      />

      <div className="pointer-events-none absolute right-3 top-3 z-10 space-y-1 rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-label uppercase text-muted backdrop-blur-md">
        <LegendRow swatch="bg-accent">Net buy</LegendRow>
        <LegendRow swatch="bg-[#585858]">Net sell</LegendRow>
        <LegendRow swatch="bg-muted">Quiet</LegendRow>
        <p>Size: TVL</p>
        <p>Line: volume</p>
        <p>{`Window: ${windowKey}`}</p>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-label uppercase text-muted">
        Drag to pan // click a token
      </p>

      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
        <MapButton
          label="Zoom in"
          onClick={() => {
            cameraRef.current = zoomBy(cameraRef.current, ZOOM_STEP);
          }}
        >
          +
        </MapButton>
        <MapButton
          label="Zoom out"
          onClick={() => {
            cameraRef.current = zoomBy(cameraRef.current, 1 / ZOOM_STEP);
          }}
        >
          -
        </MapButton>
        <MapButton label="Reset view" onClick={resetView}>
          R
        </MapButton>
      </div>

      {perfVisible && (
        <PerfOverlay
          meter={meter}
          particles={particles}
          rings={rings}
          stress={stressOn}
          onToggleStress={() => {
            const next = !stressRef.current;
            stressRef.current = next;
            setStressOn(next);
          }}
        />
      )}

      {hoveredStat !== undefined && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 z-20 w-44 rounded-xl border border-white/15 bg-black/55 px-3 py-2 font-mono text-data backdrop-blur-md"
        >
          <p className="font-sans text-sm font-semibold uppercase tracking-label text-text">
            {hoveredStat.token.symbol}
          </p>
          <dl className="mt-1 space-y-0.5">
            <TipRow
              label="Price"
              value={hoveredStat.priceUsd === null ? "--" : formatUsd(hoveredStat.priceUsd)}
            />
            <TipRow label="TVL" value={formatUsd(hoveredStat.tvlUsd)} />
            <TipRow label={`Vol ${windowKey}`} value={formatUsd(hoveredStat.current.volumeUsd)} />
          </dl>
        </div>
      )}

      {selectedStat !== undefined && (
        <SelectionCard
          stat={selectedStat}
          windowKey={windowKey}
          pools={cardPools}
          trades={cardTrades}
          onClose={() => onSelect(undefined)}
        />
      )}
    </div>
  );
}
