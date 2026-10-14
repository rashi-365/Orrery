import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import { findBestRoute, getAmountOut, minAfterSlippage, quote, type Pool, type Reserves } from "./amm";

const addr = (n: number): Address => `0x${n.toString(16).padStart(40, "0")}`;
const A = addr(1);
const B = addr(2);
const C = addr(3);
const D = addr(4);
const E = addr(5);

const P1: Pool = { address: addr(101), token0: A, token1: B };
const P2: Pool = { address: addr(102), token0: B, token1: C };
const P3: Pool = { address: addr(103), token0: A, token1: C };
const P4: Pool = { address: addr(104), token0: C, token1: D };
const POOLS = [P1, P2, P3, P4];

// A-B, B-C and C-D are deep; A-C is a shallow shortcut.
const RESERVES = new Map<Address, Reserves>([
  [P1.address, { reserve0: 1_000_000n, reserve1: 1_000_000n }],
  [P2.address, { reserve0: 1_000_000n, reserve1: 1_000_000n }],
  [P3.address, { reserve0: 1_000n, reserve1: 1_000n }],
  [P4.address, { reserve0: 1_000_000n, reserve1: 2_000_000n }],
]);

function mustRoute(amountIn: bigint, tokenIn: Address, tokenOut: Address, maxHops?: number) {
  const route = findBestRoute(POOLS, RESERVES, tokenIn, tokenOut, amountIn, maxHops);
  if (route === null) throw new Error("expected a route");
  return route;
}

test("getAmountOut matches the contract's hand-computed value and rejects empty inputs", () => {
  assert.equal(getAmountOut(1000n, 10000n, 10000n), 906n);
  assert.equal(getAmountOut(0n, 10000n, 10000n), null);
  assert.equal(getAmountOut(1000n, 0n, 10000n), null);
  assert.equal(getAmountOut(1000n, 10000n, 0n), null);
});

test("quote scales by the reserve ratio and rounds down", () => {
  assert.equal(quote(10n ** 18n, 10n * 10n ** 18n, 20n * 10n ** 18n), 2n * 10n ** 18n);
  assert.equal(quote(1n, 3n, 2n), 0n);
  assert.equal(quote(0n, 10n, 10n), null);
  assert.equal(quote(1n, 0n, 10n), null);
});

test("minAfterSlippage rounds down", () => {
  assert.equal(minAfterSlippage(1000n, 50n), 995n);
  assert.equal(minAfterSlippage(999n, 50n), 994n);
  assert.equal(minAfterSlippage(1000n, 0n), 1000n);
});

test("the router prefers the deeper two-hop path over a shallow direct pool", () => {
  const route = mustRoute(100n, A, C);
  assert.deepEqual(route.path, [A, B, C]);
  assert.equal(route.amountOut, 98n);
  const direct = getAmountOut(100n, 1_000n, 1_000n);
  assert.equal(direct, 90n);
});

test("maxHops limits the search", () => {
  const direct = mustRoute(100n, A, C, 1);
  assert.deepEqual(direct.path, [A, C]);
  assert.equal(direct.amountOut, 90n);
});

test("a three-hop route is found when it beats the two-hop route", () => {
  const long = mustRoute(100n, A, D);
  assert.deepEqual(long.path, [A, B, C, D]);
  assert.equal(long.amountOut, 195n);
  const short = mustRoute(100n, A, D, 2);
  assert.deepEqual(short.path, [A, C, D]);
  assert.equal(short.amountOut, 179n);
});

test("no route for unconnected tokens, identical tokens, zero amounts or missing reserves", () => {
  assert.equal(findBestRoute(POOLS, RESERVES, A, E, 100n), null);
  assert.equal(findBestRoute(POOLS, RESERVES, A, A, 100n), null);
  assert.equal(findBestRoute(POOLS, RESERVES, A, B, 0n), null);
  assert.equal(findBestRoute(POOLS, new Map(), A, B, 100n), null);
});

test("each hop feeds the next and the route output is the last hop's output", () => {
  const route = mustRoute(100n, A, D);
  assert.equal(route.hops.length, 3);
  const [first, second, third] = route.hops;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("expected three hops");
  }
  assert.equal(first.amountIn, 100n);
  assert.equal(second.amountIn, first.amountOut);
  assert.equal(third.amountIn, second.amountOut);
  assert.equal(route.amountOut, third.amountOut);
});

test("trading an amount equal to the reserve has a price impact near 50 percent", () => {
  const route = mustRoute(1_000_000n, A, B, 1);
  assert.equal(route.priceImpactBps, 4992);
});

test("a tiny trade has a price impact of about a tenth of a percent at most", () => {
  const route = mustRoute(1_000n, A, B, 1);
  assert.ok(route.priceImpactBps >= 5 && route.priceImpactBps <= 15);
});
