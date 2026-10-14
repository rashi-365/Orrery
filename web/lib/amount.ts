import { formatUnits, parseUnits } from "viem";
import { MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS } from "./limits";

/** Parses a decimal string into raw units. Null if empty, malformed or too precise. */
export function parseAmount(text: string, decimals: number): bigint | null {
  let trimmed = text.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return null;
  if (trimmed.startsWith(".")) trimmed = `0${trimmed}`;
  if (trimmed.endsWith(".")) trimmed = trimmed.slice(0, -1);
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  return parseUnits(trimmed, decimals);
}

/** Display form of a raw amount: thousands separators, fraction truncated and trimmed. */
export function formatAmount(value: bigint, decimals: number, maxFraction = 6): string {
  const [integer = "0", fraction = ""] = formatUnits(value, decimals).split(".");
  const trimmedFraction = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (trimmedFraction !== "") return `${grouped}.${trimmedFraction}`;
  if (integer === "0" && value > 0n) return `<0.${"0".repeat(maxFraction - 1)}1`;
  return grouped;
}

/** Basis points as a percentage with two decimals: 30 becomes "0.30". */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** Parses a slippage percentage such as "0.5" into basis points. Null if outside the allowed range. */
export function parseSlippagePercent(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps < MIN_SLIPPAGE_BPS || bps > MAX_SLIPPAGE_BPS) return null;
  return bps;
}
