import { randomInt, type Rng } from "./random.ts";

export type SizeClass = "small" | "medium" | "large";

/** Trade size as basis points of the input-side reserve (100 bps = 1%). */
export const SIZE_BANDS: Readonly<Record<SizeClass, { minBps: number; maxBps: number }>> = {
  small: { minBps: 5, maxBps: 50 },
  medium: { minBps: 51, maxBps: 200 },
  large: { minBps: 300, maxBps: 800 },
};

export const LARGE_TRADE_PROBABILITY = 0.05;
export const MEDIUM_TRADE_PROBABILITY = 0.25;
export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 4000;

/** Roughly 70% small, 25% medium, 5% large. */
export function pickSizeClass(rng: Rng): SizeClass {
  const roll = rng();
  if (roll < LARGE_TRADE_PROBABILITY) return "large";
  if (roll < LARGE_TRADE_PROBABILITY + MEDIUM_TRADE_PROBABILITY) return "medium";
  return "small";
}

/** Milliseconds to wait before the next swap: 1 to 4 seconds. */
export function nextDelayMs(rng: Rng): number {
  return randomInt(rng, MIN_DELAY_MS, MAX_DELAY_MS);
}

/** Input amount for a swap, as a random share of the input reserve inside the size band. */
export function computeAmountIn(reserveIn: bigint, sizeClass: SizeClass, rng: Rng): bigint {
  const band = SIZE_BANDS[sizeClass];
  const bps = BigInt(randomInt(rng, band.minBps, band.maxBps));
  return (reserveIn * bps) / 10_000n;
}
