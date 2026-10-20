import type { Address } from "viem";
import type { Reserves } from "./amm";
import type { SwapEvent, SyncPoint } from "./events";

/** Share of each swap's input that stays in the pool as the fee. */
export const FEE_RATE = 0.003;

export type WindowKey = "5m" | "1h" | "24h";

export const WINDOW_SECONDS: Readonly<Record<WindowKey, number>> = {
  "5m": 300,
  "1h": 3600,
  "24h": 86_400,
};

export type Metric = "volume" | "tvl" | "swaps" | "fees";

export type TokenMeta = {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
};

export type PoolMeta = {
  readonly address: Address;
  readonly token0: Address;
  readonly token1: Address;
};

export type WindowTotals = {
  volumeUsd: number;
  swaps: number;
  feesUsd: number;
  /** Value of this token received by traders (the token was the output). */
  buyUsd: number;
  /** Value of this token given up by traders (the token was the input). */
  sellUsd: number;
};

export type TokenStat = {
  readonly token: TokenMeta;
  readonly priceUsd: number | null;
  readonly tvlUsd: number;
  /** Liquidity at the start of the window, at current prices. Null if unknown. */
  readonly tvlStartUsd: number | null;
  readonly current: Readonly<WindowTotals>;
  readonly previous: Readonly<WindowTotals>;
  /** Net buying pressure from -1 (all selling) to 1 (all buying). Zero with no trades. */
  readonly pressure: number;
};

export type StatsInput = {
  readonly tokens: readonly TokenMeta[];
  readonly pools: readonly PoolMeta[];
  readonly reserves: ReadonlyMap<Address, Reserves>;
  readonly swaps: readonly SwapEvent[];
  readonly syncs: readonly SyncPoint[];
  readonly prices: ReadonlyMap<Address, number>;
  readonly now: number;
  readonly windowSeconds: number;
};

export function unitsToNumber(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/**
 * Dollar price of each token, treating the quote token as one dollar and pricing the others
 * through their pool with it. Tokens without a funded quote pool get no price.
 */
export function computePrices(
  tokens: readonly TokenMeta[],
  pools: readonly PoolMeta[],
  reserves: ReadonlyMap<Address, Reserves>,
  quoteSymbol: string,
): Map<Address, number> {
  const prices = new Map<Address, number>();
  const quote = tokens.find((token) => token.symbol === quoteSymbol);
  if (quote === undefined) return prices;
  prices.set(quote.address, 1);

  const byAddress = new Map(tokens.map((token) => [token.address, token] as const));
  for (const pool of pools) {
    const poolReserves = reserves.get(pool.address);
    if (poolReserves === undefined || poolReserves.reserve0 <= 0n || poolReserves.reserve1 <= 0n) {
      continue;
    }
    let other: Address;
    let quoteRaw: bigint;
    let otherRaw: bigint;
    if (pool.token0 === quote.address) {
      other = pool.token1;
      quoteRaw = poolReserves.reserve0;
      otherRaw = poolReserves.reserve1;
    } else if (pool.token1 === quote.address) {
      other = pool.token0;
      quoteRaw = poolReserves.reserve1;
      otherRaw = poolReserves.reserve0;
    } else {
      continue;
    }
    const otherToken = byAddress.get(other);
    if (otherToken === undefined) continue;
    prices.set(
      other,
      unitsToNumber(quoteRaw, quote.decimals) / unitsToNumber(otherRaw, otherToken.decimals),
    );
  }
  return prices;
}

export function tokenValueUsd(
  raw: bigint,
  token: TokenMeta,
  prices: ReadonlyMap<Address, number>,
): number | null {
  const price = prices.get(token.address);
  if (price === undefined) return null;
  return unitsToNumber(raw, token.decimals) * price;
}

/** Total value locked, overall and per token, at the given prices. */
export function computeTvl(
  tokens: readonly TokenMeta[],
  pools: readonly PoolMeta[],
  reserves: ReadonlyMap<Address, Reserves>,
  prices: ReadonlyMap<Address, number>,
): { total: number; byToken: Map<Address, number> } {
  const byAddress = new Map(tokens.map((token) => [token.address, token] as const));
  const byToken = new Map<Address, number>();
  let total = 0;
  for (const pool of pools) {
    const poolReserves = reserves.get(pool.address);
    if (poolReserves === undefined) continue;
    const sides: ReadonlyArray<readonly [Address, bigint]> = [
      [pool.token0, poolReserves.reserve0],
      [pool.token1, poolReserves.reserve1],
    ];
    for (const [address, raw] of sides) {
      const token = byAddress.get(address);
      if (token === undefined) continue;
      const value = tokenValueUsd(raw, token, prices);
      if (value === null) continue;
      byToken.set(address, (byToken.get(address) ?? 0) + value);
      total += value;
    }
  }
  return { total, byToken };
}

/** Dollar value of a swap: the input side if it has a price, otherwise the output side. */
export function swapValueUsd(
  swap: SwapEvent,
  tokens: ReadonlyMap<Address, TokenMeta>,
  prices: ReadonlyMap<Address, number>,
): number | null {
  const tokenIn = tokens.get(swap.tokenIn);
  const inValue = tokenIn === undefined ? null : tokenValueUsd(swap.amountIn, tokenIn, prices);
  if (inValue !== null) return inValue;
  const tokenOut = tokens.get(swap.tokenOut);
  return tokenOut === undefined ? null : tokenValueUsd(swap.amountOut, tokenOut, prices);
}

function emptyTotals(): WindowTotals {
  return { volumeUsd: 0, swaps: 0, feesUsd: 0, buyUsd: 0, sellUsd: 0 };
}

function lastAtOrBefore(points: readonly SyncPoint[], time: number): SyncPoint | undefined {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const point = points[mid];
    if (point === undefined) break;
    if (point.timestamp <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found === -1 ? undefined : points[found];
}

/** Per-token statistics for the window ending now, plus the window before it for comparison. */
export function computeTokenStats(input: StatsInput): TokenStat[] {
  const { tokens, pools, reserves, swaps, syncs, prices, now, windowSeconds } = input;
  const tokenMap = new Map(tokens.map((token) => [token.address, token] as const));
  const tvl = computeTvl(tokens, pools, reserves, prices);

  const current = new Map<Address, WindowTotals>();
  const previous = new Map<Address, WindowTotals>();
  for (const token of tokens) {
    current.set(token.address, emptyTotals());
    previous.set(token.address, emptyTotals());
  }

  const currentStart = now - windowSeconds;
  const previousStart = now - 2 * windowSeconds;
  for (const swap of swaps) {
    let bucket: Map<Address, WindowTotals>;
    if (swap.timestamp > currentStart && swap.timestamp <= now) bucket = current;
    else if (swap.timestamp > previousStart && swap.timestamp <= currentStart) bucket = previous;
    else continue;

    const value = swapValueUsd(swap, tokenMap, prices);
    const input = bucket.get(swap.tokenIn);
    const output = bucket.get(swap.tokenOut);
    if (input !== undefined) {
      input.swaps += 1;
      if (value !== null) {
        input.volumeUsd += value;
        input.feesUsd += value * FEE_RATE;
        input.sellUsd += value;
      }
    }
    if (output !== undefined) {
      output.swaps += 1;
      if (value !== null) {
        output.volumeUsd += value;
        output.buyUsd += value;
      }
    }
  }

  const syncsByPool = new Map<Address, SyncPoint[]>();
  for (const sync of syncs) {
    const list = syncsByPool.get(sync.pool);
    if (list === undefined) syncsByPool.set(sync.pool, [sync]);
    else list.push(sync);
  }

  const tvlAt = (token: TokenMeta, time: number): number | null => {
    const price = prices.get(token.address);
    if (price === undefined) return null;
    let total = 0;
    for (const pool of pools) {
      if (pool.token0 !== token.address && pool.token1 !== token.address) continue;
      const point = lastAtOrBefore(syncsByPool.get(pool.address) ?? [], time);
      if (point === undefined) return null;
      const raw = pool.token0 === token.address ? point.reserve0 : point.reserve1;
      total += unitsToNumber(raw, token.decimals) * price;
    }
    return total;
  };

  return tokens.map((token): TokenStat => {
    const now0 = current.get(token.address) ?? emptyTotals();
    const before = previous.get(token.address) ?? emptyTotals();
    const flow = now0.buyUsd + now0.sellUsd;
    return {
      token,
      priceUsd: prices.get(token.address) ?? null,
      tvlUsd: tvl.byToken.get(token.address) ?? 0,
      tvlStartUsd: tvlAt(token, currentStart),
      current: now0,
      previous: before,
      pressure: flow > 0 ? (now0.buyUsd - now0.sellUsd) / flow : 0,
    };
  });
}

export function metricValue(stat: TokenStat, metric: Metric): number {
  switch (metric) {
    case "volume":
      return stat.current.volumeUsd;
    case "tvl":
      return stat.tvlUsd;
    case "swaps":
      return stat.current.swaps;
    case "fees":
      return stat.current.feesUsd;
  }
}

/** Percentage change against the previous window. Null when there is no baseline to compare. */
export function metricDeltaPct(stat: TokenStat, metric: Metric): number | null {
  let now: number;
  let before: number;
  switch (metric) {
    case "volume":
      now = stat.current.volumeUsd;
      before = stat.previous.volumeUsd;
      break;
    case "swaps":
      now = stat.current.swaps;
      before = stat.previous.swaps;
      break;
    case "fees":
      now = stat.current.feesUsd;
      before = stat.previous.feesUsd;
      break;
    case "tvl":
      if (stat.tvlStartUsd === null) return null;
      now = stat.tvlUsd;
      before = stat.tvlStartUsd;
      break;
  }
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

/** Tokens ordered by a metric, largest first, ties broken by symbol. */
export function rankTokens(stats: readonly TokenStat[], metric: Metric): TokenStat[] {
  return [...stats].sort(
    (a, b) => metricValue(b, metric) - metricValue(a, metric) || a.token.symbol.localeCompare(b.token.symbol),
  );
}

export type PoolStat = {
  readonly pool: PoolMeta;
  readonly tvlUsd: number;
  readonly volumeUsd: number;
  readonly swaps: number;
};

export type PoolStatsInput = Pick<
  StatsInput,
  "tokens" | "pools" | "reserves" | "swaps" | "prices" | "now" | "windowSeconds"
>;

/** Liquidity, window volume and swap count for every pool. */
export function computePoolStats(input: PoolStatsInput): PoolStat[] {
  const { tokens, pools, reserves, swaps, prices, now, windowSeconds } = input;
  const tokenMap = new Map(tokens.map((token) => [token.address, token] as const));
  const volume = new Map<Address, number>();
  const counts = new Map<Address, number>();
  const start = now - windowSeconds;

  for (const swap of swaps) {
    if (swap.timestamp <= start || swap.timestamp > now) continue;
    counts.set(swap.pool, (counts.get(swap.pool) ?? 0) + 1);
    const value = swapValueUsd(swap, tokenMap, prices);
    if (value !== null) volume.set(swap.pool, (volume.get(swap.pool) ?? 0) + value);
  }

  return pools.map((pool): PoolStat => {
    const poolReserves = reserves.get(pool.address);
    let tvlUsd = 0;
    if (poolReserves !== undefined) {
      const sides: ReadonlyArray<readonly [Address, bigint]> = [
        [pool.token0, poolReserves.reserve0],
        [pool.token1, poolReserves.reserve1],
      ];
      for (const [address, raw] of sides) {
        const token = tokenMap.get(address);
        if (token === undefined) continue;
        const value = tokenValueUsd(raw, token, prices);
        if (value !== null) tvlUsd += value;
      }
    }
    return { pool, tvlUsd, volumeUsd: volume.get(pool.address) ?? 0, swaps: counts.get(pool.address) ?? 0 };
  });
}
