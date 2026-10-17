import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSlippageHeadroom,
  computeAddAmounts,
  deriveDesired,
  estimateShares,
  formatShare,
  isqrt,
  liquidityForPercent,
  parsePercent,
  planAllowances,
  projectedShare,
  withdrawAmounts,
} from "./liquidity";

const E18 = 10n ** 18n;

test("isqrt rounds down and handles small and large values", () => {
  assert.equal(isqrt(0n), 0n);
  assert.equal(isqrt(1n), 1n);
  assert.equal(isqrt(2n), 1n);
  assert.equal(isqrt(15n), 3n);
  assert.equal(isqrt(16n), 4n);
  assert.equal(isqrt(4n * 10n ** 36n), 2n * E18);
  assert.equal(isqrt(10n ** 36n - 1n), E18 - 1n);
  assert.throws(() => isqrt(-1n), /negative/);
});

test("computeAddAmounts keeps amounts that already match the pool ratio", () => {
  assert.deepEqual(computeAddAmounts(100n, 200n, 1000n, 2000n), { amountA: 100n, amountB: 200n });
  assert.deepEqual(computeAddAmounts(100n, 1000n, 1000n, 2000n), { amountA: 100n, amountB: 200n });
});

test("computeAddAmounts trims whichever side is too large", () => {
  assert.deepEqual(computeAddAmounts(1000n, 100n, 1000n, 2000n), { amountA: 50n, amountB: 100n });
});

test("computeAddAmounts accepts any ratio for an empty pool and rejects invalid input", () => {
  assert.deepEqual(computeAddAmounts(7n, 9n, 0n, 0n), { amountA: 7n, amountB: 9n });
  assert.equal(computeAddAmounts(0n, 9n, 1000n, 2000n), null);
  assert.equal(computeAddAmounts(7n, 0n, 1000n, 2000n), null);
  assert.equal(computeAddAmounts(1n, 1n, 0n, 5n), null);
  assert.equal(computeAddAmounts(1n, 1n, 5n, 0n), null);
});

test("deriveDesired fills in the other side at the pool ratio from either direction", () => {
  assert.deepEqual(deriveDesired(0, 100n, 1000n, 2000n), { amount0: 100n, amount1: 200n });
  assert.deepEqual(deriveDesired(1, 200n, 1000n, 2000n), { amount0: 100n, amount1: 200n });
  assert.deepEqual(deriveDesired(1, 3n, 1000n, 2000n), { amount0: 1n, amount1: 3n });
  assert.equal(deriveDesired(0, 0n, 1000n, 2000n), null);
  assert.equal(deriveDesired(0, 5n, 0n, 0n), null);
});

test("estimateShares for a first deposit locks the minimum liquidity", () => {
  assert.equal(estimateShares(4n * E18, E18, 0n, 0n, 0n), 2n * E18 - 1000n);
  assert.equal(estimateShares(1001n, 1001n, 0n, 0n, 0n), 1n);
  assert.equal(estimateShares(1000n, 1000n, 0n, 0n, 0n), 0n);
  assert.equal(estimateShares(0n, 1000n, 0n, 0n, 0n), 0n);
});

test("estimateShares for later deposits follows the smaller side", () => {
  const supply = 2n * E18;
  assert.equal(estimateShares(2n * E18, E18 / 2n, 4n * E18, E18, supply), E18);
  assert.equal(estimateShares(2n * E18, E18, 4n * E18, E18, supply), E18);
  assert.equal(estimateShares(1n, 1n, 0n, 0n, supply), 0n);
});

test("withdrawAmounts returns the proportional share and handles empty input", () => {
  assert.deepEqual(withdrawAmounts(E18, 4n * E18, E18, 2n * E18), {
    amount0: 2n * E18,
    amount1: E18 / 2n,
  });
  assert.deepEqual(withdrawAmounts(E18, 4n * E18, E18, 0n), { amount0: 0n, amount1: 0n });
  assert.deepEqual(withdrawAmounts(0n, 4n * E18, E18, 2n * E18), { amount0: 0n, amount1: 0n });
});

test("formatShare prints percentages, dust and empty shares", () => {
  assert.equal(formatShare(E18, 4n * E18), "25.00%");
  assert.equal(formatShare(5n * 10n ** 15n, E18), "0.50%");
  assert.equal(formatShare(E18, E18), "100.00%");
  assert.equal(formatShare(1n, E18), "<0.01%");
  assert.equal(formatShare(0n, E18), "0.00%");
  assert.equal(formatShare(1n, 0n), "0.00%");
});

test("projectedShare accounts for the new shares joining the pool", () => {
  assert.equal(projectedShare(0n, E18, 3n * E18), "25.00%");
  assert.equal(projectedShare(E18, E18, 3n * E18), "50.00%");
});

test("liquidityForPercent takes a whole-number share and 100 burns everything", () => {
  assert.equal(liquidityForPercent(1000n, 25), 250n);
  assert.equal(liquidityForPercent(1000n, 1), 10n);
  assert.equal(liquidityForPercent(1000n, 100), 1000n);
  assert.equal(liquidityForPercent(7n, 50), 3n);
});

test("parsePercent accepts 1 to 100 and rejects everything else", () => {
  assert.equal(parsePercent("25"), 25);
  assert.equal(parsePercent("1"), 1);
  assert.equal(parsePercent("100"), 100);
  assert.equal(parsePercent("0"), null);
  assert.equal(parsePercent("101"), null);
  assert.equal(parsePercent("2.5"), null);
  assert.equal(parsePercent(""), null);
  assert.equal(parsePercent("abc"), null);
});

test("addSlippageHeadroom raises an amount by the tolerance, rounding down", () => {
  assert.equal(addSlippageHeadroom(1000n, 50n), 1005n);
  assert.equal(addSlippageHeadroom(999n, 50n), 1003n);
  assert.equal(addSlippageHeadroom(1000n, 0n), 1000n);
});

test("planAllowances approves the typed token exactly and gives the computed token headroom", () => {
  const typedFirst = planAllowances(0, 100n, { amountA: 100n, amountB: 200n }, 50n);
  assert.deepEqual(typedFirst, { need0: 100n, need1: 200n, approve0: 100n, approve1: 201n });
});

test("planAllowances mirrors the plan when the second token is the one typed", () => {
  const typedSecond = planAllowances(1, 20_000n, { amountA: 10_000n, amountB: 19_999n }, 50n);
  assert.deepEqual(typedSecond, {
    need0: 10_000n,
    need1: 20_000n,
    approve0: 10_050n,
    approve1: 20_000n,
  });
});
