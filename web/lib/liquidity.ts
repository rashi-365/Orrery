import { formatBps } from "./amount";
import { quote } from "./amm";

/** Shares permanently locked on a pool's first deposit. Must match Pair.MINIMUM_LIQUIDITY. */
export const MINIMUM_LIQUIDITY = 1000n;

const BPS = 10_000n;

export type AddAmounts = {
  readonly amountA: bigint;
  readonly amountB: bigint;
};

export type DesiredAmounts = {
  readonly amount0: bigint;
  readonly amount1: bigint;
};

export type WithdrawAmounts = {
  readonly amount0: bigint;
  readonly amount1: bigint;
};

export type AllowancePlan = {
  /** Allowance each token needs for the deposit to go through at the current price. */
  readonly need0: bigint;
  readonly need1: bigint;
  /** Amount to approve. The computed side carries slippage headroom; the typed side is exact. */
  readonly approve0: bigint;
  readonly approve1: bigint;
};

/** Integer square root, rounded down. Matches the pair's first-deposit math. */
export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("isqrt of a negative number");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/**
 * The amounts the router actually deposits for given desired amounts, mirroring
 * Router._addLiquidity. Null when an amount is zero or the pool has only one empty side.
 */
export function computeAddAmounts(
  desiredA: bigint,
  desiredB: bigint,
  reserveA: bigint,
  reserveB: bigint,
): AddAmounts | null {
  if (desiredA <= 0n || desiredB <= 0n) return null;
  if (reserveA === 0n && reserveB === 0n) return { amountA: desiredA, amountB: desiredB };
  const optimalB = quote(desiredA, reserveA, reserveB);
  if (optimalB === null) return null;
  if (optimalB <= desiredB) return { amountA: desiredA, amountB: optimalB };
  const optimalA = quote(desiredB, reserveB, reserveA);
  if (optimalA === null) return null;
  return { amountA: optimalA, amountB: desiredB };
}

/** Given the amount typed for one side, the matching amount of the other at the pool ratio. */
export function deriveDesired(
  typedSide: 0 | 1,
  typedAmount: bigint,
  reserve0: bigint,
  reserve1: bigint,
): DesiredAmounts | null {
  if (typedAmount <= 0n || reserve0 <= 0n || reserve1 <= 0n) return null;
  if (typedSide === 0) {
    const amount1 = quote(typedAmount, reserve0, reserve1);
    return amount1 === null ? null : { amount0: typedAmount, amount1 };
  }
  const amount0 = quote(typedAmount, reserve1, reserve0);
  return amount0 === null ? null : { amount0, amount1: typedAmount };
}

/** An amount increased by the slippage tolerance, rounded down. */
export function addSlippageHeadroom(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS + slippageBps)) / BPS;
}

/** Which allowances a deposit needs and what to approve for each. */
export function planAllowances(
  typedSide: 0 | 1,
  typedAmount: bigint,
  deposit: AddAmounts,
  slippageBps: bigint,
): AllowancePlan {
  const derivedNeed = typedSide === 0 ? deposit.amountB : deposit.amountA;
  const derivedApprove = addSlippageHeadroom(derivedNeed, slippageBps);
  if (typedSide === 0) {
    return { need0: typedAmount, need1: derivedNeed, approve0: typedAmount, approve1: derivedApprove };
  }
  return { need0: derivedNeed, need1: typedAmount, approve0: derivedApprove, approve1: typedAmount };
}

/** LP shares a deposit mints, mirroring Pair.mint. Zero if the deposit is too small. */
export function estimateShares(
  amount0: bigint,
  amount1: bigint,
  reserve0: bigint,
  reserve1: bigint,
  totalSupply: bigint,
): bigint {
  if (amount0 <= 0n || amount1 <= 0n) return 0n;
  if (totalSupply === 0n) {
    const root = isqrt(amount0 * amount1);
    return root > MINIMUM_LIQUIDITY ? root - MINIMUM_LIQUIDITY : 0n;
  }
  if (reserve0 <= 0n || reserve1 <= 0n) return 0n;
  const byToken0 = (amount0 * totalSupply) / reserve0;
  const byToken1 = (amount1 * totalSupply) / reserve1;
  return byToken0 < byToken1 ? byToken0 : byToken1;
}

/** Tokens returned for burning a number of LP shares, rounded down like the pair does. */
export function withdrawAmounts(
  liquidity: bigint,
  reserve0: bigint,
  reserve1: bigint,
  totalSupply: bigint,
): WithdrawAmounts {
  if (totalSupply <= 0n || liquidity <= 0n) return { amount0: 0n, amount1: 0n };
  return {
    amount0: (liquidity * reserve0) / totalSupply,
    amount1: (liquidity * reserve1) / totalSupply,
  };
}

/** Share of the pool as text: "25.00%", "<0.01%" for dust, "0.00%" for none. */
export function formatShare(balance: bigint, totalSupply: bigint): string {
  if (totalSupply <= 0n || balance <= 0n) return "0.00%";
  const bps = (balance * BPS) / totalSupply;
  if (bps === 0n) return "<0.01%";
  return `${formatBps(Number(bps))}%`;
}

/** The share a holder would have after minting new shares into the pool. */
export function projectedShare(holderBalance: bigint, newShares: bigint, totalSupply: bigint): string {
  return formatShare(holderBalance + newShares, totalSupply + newShares);
}

/** LP shares to burn for a whole-number percentage of a position. 100 burns everything. */
export function liquidityForPercent(balance: bigint, percent: number): bigint {
  if (percent >= 100) return balance;
  return (balance * BigInt(percent)) / 100n;
}

/** Parses a whole-number percentage from 1 to 100. Null otherwise. */
export function parsePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 100 ? value : null;
}
