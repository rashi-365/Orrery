import type { Address, Hex } from "viem";

// Mirrors AmmLibrary.sol: a 0.30% fee expressed as 997/1000.
const FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;
const BPS = 10_000n;

type LogBase = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly txHash: Hex;
};

export type SwapLog = LogBase & {
  readonly kind: "Swap";
  readonly amount0In: bigint;
  readonly amount1In: bigint;
  readonly amount0Out: bigint;
  readonly amount1Out: bigint;
};

export type SyncLog = LogBase & {
  readonly kind: "Sync";
  readonly reserve0: bigint;
  readonly reserve1: bigint;
};

export type PairLog = SwapLog | SyncLog;

export type PoolInfo = {
  readonly address: Address;
  readonly token0: Address;
  readonly token1: Address;
};

export type SwapEvent = {
  readonly id: string;
  readonly pool: Address;
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly timestamp: number;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  /** Price impact in basis points, or null when the pre-swap reserves are unknown. */
  readonly priceImpactBps: number | null;
};

export type SyncPoint = {
  readonly id: string;
  readonly pool: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly timestamp: number;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
};

/** Pools keyed by lowercase address, because RPC logs and config differ in letter case. */
export function indexPools(pools: readonly PoolInfo[]): Map<string, PoolInfo> {
  return new Map(pools.map((pool): [string, PoolInfo] => [pool.address.toLowerCase(), pool]));
}

/**
 * How far a swap moved the price, excluding the 0.30% fee, in basis points. Compares the
 * output with what the pre-swap spot price would have returned. Null if it cannot be known.
 */
export function swapImpactBps(
  amountIn: bigint,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): number | null {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  const ideal = (amountIn * FEE_NUMERATOR * reserveOut) / (reserveIn * FEE_DENOMINATOR);
  if (ideal <= 0n) return null;
  if (amountOut >= ideal) return 0;
  return Number(((ideal - amountOut) * BPS) / ideal);
}

function byPosition(
  a: { readonly blockNumber: bigint; readonly logIndex: number },
  b: { readonly blockNumber: bigint; readonly logIndex: number },
): number {
  if (a.blockNumber < b.blockNumber) return -1;
  if (a.blockNumber > b.blockNumber) return 1;
  return a.logIndex - b.logIndex;
}

/**
 * Turns raw Swap and Sync logs into swap events and reserve snapshots. A pair emits Sync
 * immediately before Swap in the same transaction, so the Sync one log earlier gives the
 * reserves after the swap, and the reserves before it follow by reversing the amounts.
 * Logs from unknown pools, or from blocks without a known timestamp, are skipped.
 */
export function buildEvents(
  logs: readonly PairLog[],
  pools: ReadonlyMap<string, PoolInfo>,
  timestamps: ReadonlyMap<bigint, number>,
): { swaps: SwapEvent[]; syncs: SyncPoint[] } {
  const syncLogs = new Map<string, SyncLog>();
  for (const log of logs) {
    if (log.kind === "Sync") syncLogs.set(`${log.txHash}:${log.logIndex}`, log);
  }

  const swaps: SwapEvent[] = [];
  const syncs: SyncPoint[] = [];

  for (const log of logs) {
    const pool = pools.get(log.address.toLowerCase());
    const timestamp = timestamps.get(log.blockNumber);
    if (pool === undefined || timestamp === undefined) continue;

    if (log.kind === "Sync") {
      syncs.push({
        id: `${log.txHash}:${log.logIndex}`,
        pool: pool.address,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        timestamp,
        reserve0: log.reserve0,
        reserve1: log.reserve1,
      });
      continue;
    }

    const zeroForOne = log.amount0In > 0n;
    const oneForZero = log.amount1In > 0n;
    if (zeroForOne === oneForZero) continue;
    const amountIn = zeroForOne ? log.amount0In : log.amount1In;
    const amountOut = zeroForOne ? log.amount1Out : log.amount0Out;
    if (amountOut <= 0n) continue;

    let priceImpactBps: number | null = null;
    const sync = syncLogs.get(`${log.txHash}:${log.logIndex - 1}`);
    if (sync !== undefined && sync.address.toLowerCase() === log.address.toLowerCase()) {
      const before0 = sync.reserve0 - log.amount0In + log.amount0Out;
      const before1 = sync.reserve1 - log.amount1In + log.amount1Out;
      if (before0 > 0n && before1 > 0n) {
        priceImpactBps = swapImpactBps(
          amountIn,
          amountOut,
          zeroForOne ? before0 : before1,
          zeroForOne ? before1 : before0,
        );
      }
    }

    swaps.push({
      id: `${log.txHash}:${log.logIndex}`,
      pool: pool.address,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      timestamp,
      tokenIn: zeroForOne ? pool.token0 : pool.token1,
      tokenOut: zeroForOne ? pool.token1 : pool.token0,
      amountIn,
      amountOut,
      priceImpactBps,
    });
  }

  swaps.sort(byPosition);
  syncs.sort(byPosition);
  return { swaps, syncs };
}

/** Drops swaps older than the cutoff (epoch seconds). */
export function pruneSwaps(swaps: readonly SwapEvent[], cutoff: number): SwapEvent[] {
  return swaps.filter((swap) => swap.timestamp >= cutoff);
}

/**
 * Drops snapshots older than the cutoff, but keeps the newest older one per pool, because it
 * is the reserve level at the start of the retained period. Input must be in time order.
 */
export function pruneSyncs(syncs: readonly SyncPoint[], cutoff: number): SyncPoint[] {
  const anchors = new Map<Address, number>();
  syncs.forEach((sync, index) => {
    if (sync.timestamp < cutoff) anchors.set(sync.pool, index);
  });
  return syncs.filter((sync, index) => sync.timestamp >= cutoff || anchors.get(sync.pool) === index);
}

/** The newest swaps, newest first. Input must be in time order. */
export function recentSwaps(swaps: readonly SwapEvent[], limit: number): SwapEvent[] {
  return swaps.slice(Math.max(0, swaps.length - limit)).reverse();
}

/** The newest swaps that involve a token, newest first. Input must be in time order. */
export function recentSwapsForToken(
  swaps: readonly SwapEvent[],
  token: Address,
  limit: number,
): SwapEvent[] {
  const result: SwapEvent[] = [];
  for (let i = swaps.length - 1; i >= 0 && result.length < limit; i--) {
    const swap = swaps[i];
    if (swap !== undefined && (swap.tokenIn === token || swap.tokenOut === token)) {
      result.push(swap);
    }
  }
  return result;
}
