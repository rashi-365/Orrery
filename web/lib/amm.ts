import type { Address } from "viem";
import { MAX_ROUTE_HOPS } from "./limits";

// Mirrors AmmLibrary.sol exactly: a 0.30% fee expressed as 997/1000, rounding in the pool's favor.
const FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;
const BPS = 10_000n;

export type Reserves = {
  readonly reserve0: bigint;
  readonly reserve1: bigint;
};

export type Pool = {
  readonly address: Address;
  readonly token0: Address;
  readonly token1: Address;
};

export type Hop = {
  readonly pool: Address;
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly reserveIn: bigint;
  readonly reserveOut: bigint;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
};

export type Route = {
  readonly path: readonly Address[];
  readonly hops: readonly Hop[];
  readonly amountOut: bigint;
  /** Price impact in basis points, excluding the pool fees. */
  readonly priceImpactBps: number;
};

/** Output for an exact input, as the router computes it. Null when the inputs make no sense. */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint | null {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null;
  const withFee = amountIn * FEE_NUMERATOR;
  return (withFee * reserveOut) / (reserveIn * FEE_DENOMINATOR + withFee);
}

/** Equivalent amount of the other asset at the current reserve ratio, rounded down. */
export function quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint | null {
  if (amountA <= 0n || reserveA <= 0n || reserveB <= 0n) return null;
  return (amountA * reserveB) / reserveA;
}

/** Smallest acceptable amount after allowing the given slippage, rounded down. */
export function minAfterSlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

function routeImpactBps(hops: readonly Hop[]): number {
  const first = hops[0];
  const last = hops[hops.length - 1];
  if (first === undefined || last === undefined) return 0;

  // What the trade would return at the spot prices, after fees but with no price movement.
  let numerator = first.amountIn;
  let denominator = 1n;
  for (const hop of hops) {
    numerator *= hop.reserveOut * FEE_NUMERATOR;
    denominator *= hop.reserveIn * FEE_DENOMINATOR;
  }
  const ideal = numerator / denominator;
  if (ideal <= 0n || last.amountOut >= ideal) return 0;
  return Number(((ideal - last.amountOut) * BPS) / ideal);
}

function buildRoute(hops: readonly Hop[]): Route {
  const first = hops[0];
  const last = hops[hops.length - 1];
  if (first === undefined || last === undefined) throw new Error("A route needs at least one hop");
  return {
    path: [first.tokenIn, ...hops.map((hop) => hop.tokenOut)],
    hops,
    amountOut: last.amountOut,
    priceImpactBps: routeImpactBps(hops),
  };
}

function pickBetter(current: Route | null, candidate: Route): Route {
  if (current === null) return candidate;
  if (candidate.amountOut > current.amountOut) return candidate;
  if (candidate.amountOut === current.amountOut && candidate.hops.length < current.hops.length) {
    return candidate;
  }
  return current;
}

/**
 * Best route from tokenIn to tokenOut through at most maxHops pools, by output amount.
 * Pools without known reserves are skipped. Null if no route returns anything.
 */
export function findBestRoute(
  pools: readonly Pool[],
  reserves: ReadonlyMap<Address, Reserves>,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  maxHops: number = MAX_ROUTE_HOPS,
): Route | null {
  if (tokenIn === tokenOut || amountIn <= 0n) return null;
  const state: { best: Route | null } = { best: null };

  const visit = (
    current: Address,
    visited: readonly Address[],
    hops: readonly Hop[],
    amount: bigint,
  ): void => {
    for (const pool of pools) {
      let next: Address;
      let zeroForOne: boolean;
      if (pool.token0 === current) {
        next = pool.token1;
        zeroForOne = true;
      } else if (pool.token1 === current) {
        next = pool.token0;
        zeroForOne = false;
      } else {
        continue;
      }
      if (visited.includes(next)) continue;

      const poolReserves = reserves.get(pool.address);
      if (poolReserves === undefined) continue;
      const reserveIn = zeroForOne ? poolReserves.reserve0 : poolReserves.reserve1;
      const reserveOut = zeroForOne ? poolReserves.reserve1 : poolReserves.reserve0;
      const out = getAmountOut(amount, reserveIn, reserveOut);
      if (out === null || out === 0n) continue;

      const hop: Hop = {
        pool: pool.address,
        tokenIn: current,
        tokenOut: next,
        reserveIn,
        reserveOut,
        amountIn: amount,
        amountOut: out,
      };
      const nextHops = [...hops, hop];
      if (next === tokenOut) {
        state.best = pickBetter(state.best, buildRoute(nextHops));
      } else if (nextHops.length < maxHops) {
        visit(next, [...visited, next], nextHops, out);
      }
    }
  };

  visit(tokenIn, [tokenIn], [], amountIn);
  return state.best;
}
