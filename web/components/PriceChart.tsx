"use client";

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { QUOTE_SYMBOL } from "@/config/app";
import { MARKET } from "@/lib/market";
import { unitsToNumber } from "@/lib/stats";
import { useMarketData } from "./MarketDataProvider";

const FRAMES = [
  { key: "1m", seconds: 60 },
  { key: "5m", seconds: 300 },
  { key: "15m", seconds: 900 },
  { key: "1h", seconds: 3600 },
] as const;
type FrameKey = (typeof FRAMES)[number]["key"];

const DEFAULT_VISIBLE = 60;
const MIN_VISIBLE = 10;
const MAX_VISIBLE = 240;
const ZOOM_BTN =
  "h-7 w-7 rounded-full border border-white/15 font-mono text-data text-text transition hover:border-white/60";
const W = 900;
const H = 300;
const PAD_L = 8;
const PAD_R = 72;
const PRICE_TOP = 12;
const PRICE_H = 180;
const VOL_TOP = 216;
const VOL_H = 56;
const UP = "#f5f5f5";
const DOWN = "#D65454";
const GRID = "rgba(255, 255, 255, 0.08)";
const LABEL = "#8f8f8f";

type Candle = {
  readonly t: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
};
type PricePoint = { readonly t: number; readonly price: number };
type VolumePoint = { readonly t: number; readonly usd: number };

function fmtPrice(p: number): string {
  if (p >= 100) return `$${p.toFixed(2)}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(3)}`;
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Groups price points into candles. Quiet periods become flat candles at the last price. */
function buildCandles(
  points: readonly PricePoint[],
  volumes: readonly VolumePoint[],
  tf: number,
  now: number,
  visible: number,
): Candle[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return [];
  const bucket = (t: number): number => Math.floor(t / tf) * tf;
  const endBucket = bucket(Math.max(now, last.t));
  const startBucket = Math.max(bucket(first.t), endBucket - (visible - 1) * tf);

  const prices = new Map<number, number[]>();
  let anchor: number | undefined;
  for (const point of points) {
    const b = bucket(point.t);
    if (b < startBucket) {
      anchor = point.price;
      continue;
    }
    const list = prices.get(b);
    if (list === undefined) prices.set(b, [point.price]);
    else list.push(point.price);
  }
  const volumeByBucket = new Map<number, number>();
  for (const v of volumes) {
    const b = bucket(v.t);
    volumeByBucket.set(b, (volumeByBucket.get(b) ?? 0) + v.usd);
  }

  const out: Candle[] = [];
  let previous = anchor;
  for (let b = startBucket; b <= endBucket; b += tf) {
    const list = prices.get(b);
    const volume = volumeByBucket.get(b) ?? 0;
    if (list !== undefined && list.length > 0) {
      const open = previous ?? list[0] ?? 0;
      const close = list[list.length - 1] ?? open;
      out.push({
        t: b,
        open,
        high: Math.max(open, ...list),
        low: Math.min(open, ...list),
        close,
        volume,
      });
      previous = close;
    } else if (previous !== undefined) {
      out.push({ t: b, open: previous, high: previous, low: previous, close: previous, volume });
    }
  }
  return out;
}

export function PriceChart({ symbol }: { readonly symbol: string }) {
  const { swaps, syncs, status, now } = useMarketData();
  const [frameKey, setFrameKey] = useState<FrameKey>("5m");
  const [hover, setHover] = useState<number | null>(null);
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);

  const token = useMemo(() => MARKET.tokens.find((t) => t.symbol === symbol), [symbol]);
  const luna = useMemo(() => MARKET.tokens.find((t) => t.symbol === QUOTE_SYMBOL), []);
  const pool = useMemo(() => {
    if (token === undefined || luna === undefined) return undefined;
    return MARKET.pools.find(
      (p) =>
        (p.token0 === token.address && p.token1 === luna.address) ||
        (p.token1 === token.address && p.token0 === luna.address),
    );
  }, [token, luna]);

  const points = useMemo<PricePoint[]>(() => {
    if (token === undefined || luna === undefined || pool === undefined) return [];
    const tokenIsZero = pool.token0 === token.address;
    const out: PricePoint[] = [];
    for (const s of syncs) {
      if (s.pool !== pool.address) continue;
      const reserveToken = unitsToNumber(tokenIsZero ? s.reserve0 : s.reserve1, token.decimals);
      const reserveLuna = unitsToNumber(tokenIsZero ? s.reserve1 : s.reserve0, luna.decimals);
      if (reserveToken > 0 && reserveLuna > 0) {
        out.push({ t: s.timestamp, price: reserveLuna / reserveToken });
      }
    }
    return out;
  }, [syncs, token, luna, pool]);

  const volumes = useMemo<VolumePoint[]>(() => {
    if (luna === undefined || pool === undefined) return [];
    const out: VolumePoint[] = [];
    for (const s of swaps) {
      if (s.pool !== pool.address) continue;
      const usd =
        s.tokenIn === luna.address
          ? unitsToNumber(s.amountIn, luna.decimals)
          : s.tokenOut === luna.address
            ? unitsToNumber(s.amountOut, luna.decimals)
            : 0;
      out.push({ t: s.timestamp, usd });
    }
    return out;
  }, [swaps, luna, pool]);

  const frame = FRAMES.find((f) => f.key === frameKey) ?? FRAMES[1];
  const candles = useMemo(
    () => buildCandles(points, volumes, frame.seconds, now, visible),
    [points, volumes, frame.seconds, now, visible],
  );

  if (symbol === QUOTE_SYMBOL) {
    return (
      <p className="py-10 text-center font-mono text-label uppercase text-muted">
        {`${QUOTE_SYMBOL} is the $1 quote token. Every other token is priced against it.`}
      </p>
    );
  }
  if (pool === undefined) {
    return (
      <p className="py-10 text-center font-mono text-label uppercase text-muted">
        {`No ${QUOTE_SYMBOL} pool found for ${symbol}`}
      </p>
    );
  }
  const n = candles.length;
  const lastCandle = candles[n - 1];
  const firstCandle = candles[0];
  if (lastCandle === undefined || firstCandle === undefined) {
    return (
      <p className="py-10 text-center font-mono text-label uppercase text-muted">
        {status === "connecting" ? "Loading price history" : "No trades yet for this token"}
      </p>
    );
  }

  const plotW = W - PAD_L - PAD_R;
  const slot = plotW / n;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let volumeMax = 0;
  let volumeTotal = 0;
  for (const c of candles) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
    volumeMax = Math.max(volumeMax, c.volume);
    volumeTotal += c.volume;
  }
  const pad = hi > lo ? (hi - lo) * 0.08 : hi * 0.01;
  const top = hi + pad;
  const bottom = lo - pad;
  const y = (p: number): number => PRICE_TOP + ((top - p) / (top - bottom)) * PRICE_H;

  const shown = (hover !== null ? candles[hover] : undefined) ?? lastCandle;
  const change = firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : 0;

  const onMove = (event: ReactMouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W - PAD_L;
    const index = Math.floor(x / slot);
    setHover(index >= 0 && index < n ? index : null);
  };

  const gridLines = [0, 1, 2, 3, 4].map((k) => {
    const value = top - ((top - bottom) * k) / 4;
    return { value, y: y(value) };
  });
  const timeLabels = [0, 1, 2, 3, 4]
    .map((k) => Math.round((k * (n - 1)) / 4))
    .filter((index, i, all) => all.indexOf(index) === i)
    .map((index) => ({ index, candle: candles[index] }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-sans text-2xl font-semibold text-text">{fmtPrice(lastCandle.close)}</p>
          <p className="font-mono text-label uppercase text-muted">
            {`${change >= 0 ? "+" : ""}${change.toFixed(2)}% over view  //  VOL ${fmtVolume(volumeTotal)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setVisible((v) => Math.min(MAX_VISIBLE, Math.round(v * 1.4)))}
            className={ZOOM_BTN}
          >
            -
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setVisible((v) => Math.max(MIN_VISIBLE, Math.round(v * 0.7)))}
            className={ZOOM_BTN}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={() => setVisible(DEFAULT_VISIBLE)}
            className={ZOOM_BTN}
          >
            R
          </button>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/15" />
          {FRAMES.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFrameKey(f.key)}
              className={`rounded-full border px-3 py-1 font-mono text-label uppercase transition ${
                f.key === frameKey
                  ? "border-white/60 text-white"
                  : "border-white/15 text-muted hover:border-white/40"
              }`}
            >
              {f.key}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 font-mono text-label uppercase text-muted">
        {`${fmtTime(shown.t)}  //  O ${fmtPrice(shown.open)}  H ${fmtPrice(shown.high)}  L ${fmtPrice(shown.low)}  C ${fmtPrice(shown.close)}  //  VOL ${fmtVolume(shown.volume)}`}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${symbol} price candles`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridLines.map((line) => (
          <g key={line.y}>
            <line x1={PAD_L} x2={W - PAD_R} y1={line.y} y2={line.y} stroke={GRID} />
            <text x={W - PAD_R + 6} y={line.y + 3} fill={LABEL} fontSize="10" className="font-mono">
              {fmtPrice(line.value)}
            </text>
          </g>
        ))}

        {candles.map((c, i) => {
          const x = PAD_L + (i + 0.5) * slot;
          const up = c.close >= c.open;
          const color = up ? UP : DOWN;
          const bodyTop = y(Math.max(c.open, c.close));
          const bodyHeight = Math.max(1, Math.abs(y(c.open) - y(c.close)));
          const barWidth = Math.min(28, Math.max(1, slot * 0.6));
          const volumeHeight = volumeMax > 0 ? (c.volume / volumeMax) * VOL_H : 0;
          return (
            <g key={c.t}>
              <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} />
              <rect
                x={x - barWidth / 2}
                y={bodyTop}
                width={barWidth}
                height={bodyHeight}
                fill={up ? "#050505" : DOWN}
                stroke={color}
              />
              <rect
                x={x - barWidth / 2}
                y={VOL_TOP + VOL_H - volumeHeight}
                width={barWidth}
                height={volumeHeight}
                fill={color}
                opacity={0.45}
              />
            </g>
          );
        })}

        {hover !== null && (
          <line
            x1={PAD_L + (hover + 0.5) * slot}
            x2={PAD_L + (hover + 0.5) * slot}
            y1={PRICE_TOP}
            y2={VOL_TOP + VOL_H}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeDasharray="3 4"
          />
        )}

        {timeLabels.map(({ index, candle }) =>
          candle === undefined ? null : (
            <text
              key={index}
              x={PAD_L + (index + 0.5) * slot}
              y={H - 6}
              fill={LABEL}
              fontSize="10"
              textAnchor="middle"
              className="font-mono"
            >
              {fmtTime(candle.t)}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}
