import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import {
  buildEvents,
  indexPools,
  pruneSwaps,
  pruneSyncs,
  recentSwaps,
  recentSwapsForToken,
  swapImpactBps,
  type PairLog,
  type SwapEvent,
  type SyncPoint,
} from "./events";

const T0: Address = `0x${"11".repeat(20)}`;
const T1: Address = `0x${"22".repeat(20)}`;
// Mixed case on purpose: RPC logs come back lowercase while the config uses checksummed addresses.
const POOL: Address = `0x${"Ab".repeat(20)}`;
const POOL_LOWER: Address = `0x${"ab".repeat(20)}`;
const POOL_UPPER: Address = `0x${"AB".repeat(20)}`;
const TX_A: Hex = `0x${"a1".repeat(32)}`;
const TX_B: Hex = `0x${"b2".repeat(32)}`;

const pools = indexPools([{ address: POOL, token0: T0, token1: T1 }]);

type Over = Partial<{ address: Address; blockNumber: bigint; txHash: Hex }>;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

function syncLog(logIndex: number, reserve0: bigint, reserve1: bigint, over: Over = {}): PairLog {
  return {
    kind: "Sync",
    address: over.address ?? POOL_LOWER,
    blockNumber: over.blockNumber ?? 10n,
    logIndex,
    txHash: over.txHash ?? TX_A,
    reserve0,
    reserve1,
  };
}

function swapLog(
  logIndex: number,
  amounts: { in0?: bigint; in1?: bigint; out0?: bigint; out1?: bigint },
  over: Over = {},
): PairLog {
  return {
    kind: "Swap",
    address: over.address ?? POOL_LOWER,
    blockNumber: over.blockNumber ?? 10n,
    logIndex,
    txHash: over.txHash ?? TX_A,
    amount0In: amounts.in0 ?? 0n,
    amount1In: amounts.in1 ?? 0n,
    amount0Out: amounts.out0 ?? 0n,
    amount1Out: amounts.out1 ?? 0n,
  };
}

function makeSwap(id: string, timestamp: number): SwapEvent {
  return {
    id,
    pool: POOL,
    txHash: TX_A,
    blockNumber: 1n,
    logIndex: 0,
    timestamp,
    tokenIn: T0,
    tokenOut: T1,
    amountIn: 1n,
    amountOut: 1n,
    priceImpactBps: null,
  };
}

function makeSync(id: string, pool: Address, timestamp: number): SyncPoint {
  return { id, pool, blockNumber: 1n, logIndex: 0, timestamp, reserve0: 1n, reserve1: 1n };
}

const TIMES = new Map<bigint, number>([[10n, 1_700_000_000]]);

test("swapImpactBps matches the contract math and rejects empty inputs", () => {
  assert.equal(swapImpactBps(1000n, 996n, 1_000_000n, 1_000_000n), 10);
  assert.equal(swapImpactBps(1000n, 997n, 1_000_000n, 1_000_000n), 0);
  assert.equal(swapImpactBps(0n, 1n, 1_000_000n, 1_000_000n), null);
  assert.equal(swapImpactBps(1000n, 1n, 0n, 1_000_000n), null);
  assert.equal(swapImpactBps(1n, 1n, 1_000_000_000n, 1n), null);
});

test("a Sync followed by a Swap becomes one swap with direction, amounts and price impact", () => {
  const logs = [syncLog(5, 1_001_000n, 999_004n), swapLog(6, { in0: 1000n, out1: 996n })];
  const built = buildEvents(logs, pools, TIMES);
  assert.equal(built.swaps.length, 1);
  const swap = must(built.swaps[0]);
  assert.equal(swap.id, `${TX_A}:6`);
  assert.equal(swap.pool, POOL);
  assert.equal(swap.tokenIn, T0);
  assert.equal(swap.tokenOut, T1);
  assert.equal(swap.amountIn, 1000n);
  assert.equal(swap.amountOut, 996n);
  assert.equal(swap.timestamp, 1_700_000_000);
  assert.equal(swap.priceImpactBps, 10);

  const sync = must(built.syncs[0]);
  assert.equal(sync.pool, POOL);
  assert.equal(sync.reserve0, 1_001_000n);
  assert.equal(sync.reserve1, 999_004n);
  assert.equal(sync.timestamp, 1_700_000_000);
});

test("a swap in the other direction is read the same way", () => {
  const logs = [syncLog(5, 999_004n, 1_001_000n), swapLog(6, { in1: 1000n, out0: 996n })];
  const swap = must(buildEvents(logs, pools, TIMES).swaps[0]);
  assert.equal(swap.tokenIn, T1);
  assert.equal(swap.tokenOut, T0);
  assert.equal(swap.amountIn, 1000n);
  assert.equal(swap.amountOut, 996n);
  assert.equal(swap.priceImpactBps, 10);
});

test("pool addresses match regardless of letter case", () => {
  const logs = [
    syncLog(5, 1_001_000n, 999_004n, { address: POOL_LOWER }),
    swapLog(6, { in0: 1000n, out1: 996n }, { address: POOL_UPPER }),
  ];
  const swap = must(buildEvents(logs, pools, TIMES).swaps[0]);
  assert.equal(swap.pool, POOL);
  assert.equal(swap.priceImpactBps, 10);
});

test("unusable swaps are skipped: both sides in, zero output, unknown pool, unknown block time", () => {
  const unknownPool: Address = `0x${"cd".repeat(20)}`;
  const logs = [
    swapLog(1, { in0: 5n, in1: 5n, out0: 1n }),
    swapLog(2, { in0: 1000n }),
    swapLog(3, { in0: 1000n, out1: 996n }, { address: unknownPool }),
    swapLog(4, { in0: 1000n, out1: 996n }, { blockNumber: 99n }),
  ];
  assert.equal(buildEvents(logs, pools, TIMES).swaps.length, 0);
});

test("a swap without the Sync right before it is kept with an unknown price impact", () => {
  const alone = buildEvents([swapLog(6, { in0: 1000n, out1: 996n })], pools, TIMES);
  assert.equal(must(alone.swaps[0]).priceImpactBps, null);

  const farther = buildEvents(
    [syncLog(3, 1_001_000n, 999_004n), swapLog(6, { in0: 1000n, out1: 996n })],
    pools,
    TIMES,
  );
  assert.equal(must(farther.swaps[0]).priceImpactBps, null);
});

test("output is ordered by block, then log index, whatever the input order", () => {
  const times = new Map<bigint, number>([
    [11n, 100],
    [12n, 200],
  ]);
  const logs = [
    swapLog(3, { in0: 10n, out1: 9n }, { blockNumber: 12n }),
    swapLog(2, { in0: 10n, out1: 9n }, { blockNumber: 11n }),
    swapLog(1, { in0: 10n, out1: 9n }, { blockNumber: 11n }),
  ];
  const swaps = buildEvents(logs, pools, times).swaps;
  assert.deepEqual(
    swaps.map((swap) => swap.logIndex),
    [1, 2, 3],
  );
  assert.deepEqual(
    swaps.map((swap) => swap.timestamp),
    [100, 100, 200],
  );
  assert.equal(TX_B.length, 66);
});

test("pruneSwaps drops swaps older than the cutoff", () => {
  const swaps = [makeSwap("a", 10), makeSwap("b", 50), makeSwap("c", 90)];
  assert.deepEqual(
    pruneSwaps(swaps, 40).map((swap) => swap.id),
    ["b", "c"],
  );
  assert.equal(pruneSwaps(swaps, 5).length, 3);
  assert.equal(pruneSwaps(swaps, 100).length, 0);
});

test("pruneSyncs keeps recent snapshots plus the newest older one for each pool", () => {
  const poolX: Address = `0x${"01".repeat(20)}`;
  const poolY: Address = `0x${"02".repeat(20)}`;
  const poolZ: Address = `0x${"03".repeat(20)}`;
  const syncs = [
    makeSync("x5", poolX, 5),
    makeSync("x20", poolX, 20),
    makeSync("y10", poolY, 10),
    makeSync("z45", poolZ, 45),
    makeSync("x60", poolX, 60),
  ];
  assert.deepEqual(
    pruneSyncs(syncs, 40).map((sync) => sync.id),
    ["x20", "y10", "z45", "x60"],
  );
});

test("recentSwaps returns the newest swaps first, limited", () => {
  const swaps = [1, 2, 3, 4, 5].map((n) => makeSwap(String(n), n));
  assert.deepEqual(
    recentSwaps(swaps, 3).map((swap) => swap.id),
    ["5", "4", "3"],
  );
  assert.equal(recentSwaps(swaps, 10).length, 5);
  assert.equal(recentSwaps([], 3).length, 0);
});

test("recentSwapsForToken returns the newest swaps that touch a token, newest first", () => {
  const X: Address = `0x${"33".repeat(20)}`;
  const Y: Address = `0x${"44".repeat(20)}`;
  const swaps = [
    makeSwap("s1", 1),
    { ...makeSwap("s2", 2), tokenIn: T1, tokenOut: T0 },
    makeSwap("s3", 3),
    { ...makeSwap("s4", 4), tokenIn: X, tokenOut: Y },
  ];
  assert.deepEqual(
    recentSwapsForToken(swaps, T0, 2).map((swap) => swap.id),
    ["s3", "s2"],
  );
  assert.deepEqual(
    recentSwapsForToken(swaps, T0, 10).map((swap) => swap.id),
    ["s3", "s2", "s1"],
  );
  assert.deepEqual(
    recentSwapsForToken(swaps, Y, 5).map((swap) => swap.id),
    ["s4"],
  );
  assert.equal(recentSwapsForToken(swaps, `0x${"55".repeat(20)}`, 5).length, 0);
});
