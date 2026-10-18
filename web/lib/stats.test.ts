import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import type { Reserves } from "./amm";
import type { SwapEvent, SyncPoint } from "./events";
import {
  computePrices,
  computeTokenStats,
  computeTvl,
  metricDeltaPct,
  metricValue,
  rankTokens,
  swapValueUsd,
  type PoolMeta,
  type TokenMeta,
  type TokenStat,
} from "./stats";

const Q: TokenMeta = { address: `0x${"01".repeat(20)}`, symbol: "LUNA", decimals: 6 };
const A: TokenMeta = { address: `0x${"02".repeat(20)}`, symbol: "AAA", decimals: 18 };
const B: TokenMeta = { address: `0x${"03".repeat(20)}`, symbol: "BBB", decimals: 6 };
const C: TokenMeta = { address: `0x${"04".repeat(20)}`, symbol: "CCC", decimals: 6 };
const TOKENS = [Q, A, B, C];

const PA: PoolMeta = { address: `0x${"a1".repeat(20)}`, token0: Q.address, token1: A.address };
const PB: PoolMeta = { address: `0x${"b2".repeat(20)}`, token0: Q.address, token1: B.address };
const PC: PoolMeta = { address: `0x${"c3".repeat(20)}`, token0: Q.address, token1: C.address };
const PAB: PoolMeta = { address: `0x${"d4".repeat(20)}`, token0: A.address, token1: B.address };
const POOLS = [PA, PB, PC];

const e6 = (n: bigint) => n * 10n ** 6n;
const e18 = (n: bigint) => n * 10n ** 18n;

// LUNA is the quote. Pool A holds 1,000,000 LUNA and 500 AAA, so AAA costs 2000.
// Pool B holds 2,000,000 LUNA and 4,000,000 BBB, so BBB costs 0.5. Pool C is empty.
const RESERVES = new Map<Address, Reserves>([
  [PA.address, { reserve0: e6(1_000_000n), reserve1: e18(500n) }],
  [PB.address, { reserve0: e6(2_000_000n), reserve1: e6(4_000_000n) }],
  [PC.address, { reserve0: 0n, reserve1: 0n }],
  [PAB.address, { reserve0: e18(10n), reserve1: e6(10n) }],
]);

const NOW = 100_000;

function makeSwap(
  id: string,
  pool: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  amountOut: bigint,
  timestamp: number,
): SwapEvent {
  return {
    id,
    pool,
    txHash: `0x${"ee".repeat(32)}`,
    blockNumber: 1n,
    logIndex: 0,
    timestamp,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    priceImpactBps: null,
  };
}

const SWAPS: SwapEvent[] = [
  // 1000 LUNA for 0.5 AAA, 100 seconds ago: worth 1000 dollars.
  makeSwap("s1", PA.address, Q.address, A.address, e6(1000n), 5n * 10n ** 17n, NOW - 100),
  // 0.25 AAA for 499 LUNA, 200 seconds ago: worth 500 dollars.
  makeSwap("s2", PA.address, A.address, Q.address, 25n * 10n ** 16n, e6(499n), NOW - 200),
  // 10,000 BBB for 4,990 LUNA, 4000 seconds ago: previous hour, worth 5000 dollars.
  makeSwap("s3", PB.address, B.address, Q.address, e6(10_000n), e6(4_990n), NOW - 4000),
  // Too old for both windows.
  makeSwap("s4", PB.address, B.address, Q.address, e6(1n), e6(1n), NOW - 8000),
];

const SYNCS: SyncPoint[] = [
  {
    id: "y1",
    pool: PA.address,
    blockNumber: 1n,
    logIndex: 0,
    timestamp: NOW - 5000,
    reserve0: e6(800_000n),
    reserve1: e18(400n),
  },
];

function approx(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

function mustNumber(value: number | null): number {
  if (value === null) throw new Error("expected a number");
  return value;
}

const prices = computePrices(TOKENS, POOLS, RESERVES, "LUNA");

function statsFor(windowSeconds: number): TokenStat[] {
  return computeTokenStats({
    tokens: TOKENS,
    pools: POOLS,
    reserves: RESERVES,
    swaps: SWAPS,
    syncs: SYNCS,
    prices,
    now: NOW,
    windowSeconds,
  });
}

function pick(stats: TokenStat[], symbol: string): TokenStat {
  return must(stats.find((stat) => stat.token.symbol === symbol));
}

test("computePrices treats the quote token as one dollar and prices the rest through their pools", () => {
  assert.equal(prices.get(Q.address), 1);
  assert.equal(prices.get(A.address), 2000);
  assert.equal(prices.get(B.address), 0.5);
  assert.equal(prices.get(C.address), undefined);
});

test("computePrices needs the quote token and a pool that contains it", () => {
  assert.equal(computePrices([A, B], [PAB], RESERVES, "LUNA").size, 0);
  const onlyQuote = computePrices(TOKENS, [PAB], RESERVES, "LUNA");
  assert.equal(onlyQuote.size, 1);
  assert.equal(onlyQuote.get(A.address), undefined);
});

test("computeTvl adds both sides of every pool and breaks the total down per token", () => {
  const tvl = computeTvl(TOKENS, POOLS, RESERVES, prices);
  assert.equal(tvl.total, 6_000_000);
  assert.equal(tvl.byToken.get(Q.address), 3_000_000);
  assert.equal(tvl.byToken.get(A.address), 1_000_000);
  assert.equal(tvl.byToken.get(B.address), 2_000_000);
  assert.equal(tvl.byToken.get(C.address), undefined);
});

test("swapValueUsd uses the input side, falls back to the output side, and gives up without prices", () => {
  const tokenMap = new Map(TOKENS.map((token) => [token.address, token] as const));
  const s2 = must(SWAPS[1]);
  assert.equal(swapValueUsd(s2, tokenMap, prices), 500);
  const onlyQuote = new Map<Address, number>([[Q.address, 1]]);
  assert.equal(swapValueUsd(s2, tokenMap, onlyQuote), 499);
  assert.equal(swapValueUsd(s2, tokenMap, new Map()), null);
});

test("computeTokenStats totals volume, swaps, fees and buy/sell pressure for the window", () => {
  const stats = statsFor(3600);
  const luna = pick(stats, "LUNA");
  assert.equal(luna.current.swaps, 2);
  approx(luna.current.volumeUsd, 1500);
  approx(luna.current.feesUsd, 3);
  approx(luna.current.buyUsd, 500);
  approx(luna.current.sellUsd, 1000);
  approx(luna.pressure, -1 / 3);

  const aaa = pick(stats, "AAA");
  assert.equal(aaa.current.swaps, 2);
  approx(aaa.current.volumeUsd, 1500);
  approx(aaa.current.feesUsd, 1.5);
  approx(aaa.current.buyUsd, 1000);
  approx(aaa.current.sellUsd, 500);
  approx(aaa.pressure, 1 / 3);

  const bbb = pick(stats, "BBB");
  assert.equal(bbb.current.swaps, 0);
  assert.equal(bbb.pressure, 0);
  assert.equal(pick(stats, "CCC").priceUsd, null);
});

test("the previous window is counted separately and swaps older than both windows are ignored", () => {
  const stats = statsFor(3600);
  const luna = pick(stats, "LUNA");
  assert.equal(luna.previous.swaps, 1);
  approx(luna.previous.volumeUsd, 5000);
  approx(luna.previous.buyUsd, 5000);

  const bbb = pick(stats, "BBB");
  assert.equal(bbb.previous.swaps, 1);
  approx(bbb.previous.volumeUsd, 5000);
  approx(bbb.previous.feesUsd, 15);
  approx(bbb.previous.sellUsd, 5000);
  assert.equal(pick(stats, "AAA").previous.swaps, 0);
});

test("metricDeltaPct compares with the previous window and needs a baseline", () => {
  const stats = statsFor(3600);
  approx(mustNumber(metricDeltaPct(pick(stats, "LUNA"), "volume")), -70);
  assert.equal(metricDeltaPct(pick(stats, "AAA"), "volume"), null);
  approx(mustNumber(metricDeltaPct(pick(stats, "BBB"), "volume")), -100);

  // AAA liquidity: 800 AAA at 2000 an hour ago is 800,000; it is 1,000,000 now.
  approx(mustNumber(metricDeltaPct(pick(stats, "AAA"), "tvl")), 25);
  // LUNA sits in a pool with no earlier snapshot, so its baseline is unknown.
  assert.equal(metricDeltaPct(pick(stats, "LUNA"), "tvl"), null);

  const luna = pick(stats, "LUNA");
  assert.equal(metricValue(luna, "swaps"), 2);
  assert.equal(metricValue(luna, "tvl"), 3_000_000);
  approx(metricValue(luna, "volume"), 1500);
  approx(metricValue(luna, "fees"), 3);
});

test("rankTokens sorts by the chosen metric and breaks ties by symbol", () => {
  const stats = statsFor(3600);
  const symbols = (metric: "volume" | "tvl" | "swaps" | "fees") =>
    rankTokens(stats, metric).map((stat) => stat.token.symbol);
  assert.deepEqual(symbols("volume"), ["AAA", "LUNA", "BBB", "CCC"]);
  assert.deepEqual(symbols("tvl"), ["LUNA", "BBB", "AAA", "CCC"]);
  assert.deepEqual(symbols("swaps"), ["AAA", "LUNA", "BBB", "CCC"]);
});
