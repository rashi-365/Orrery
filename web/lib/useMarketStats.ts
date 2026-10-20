import { useMemo } from "react";
import type { Address } from "viem";
import { useMarketData } from "@/components/MarketDataProvider";
import { QUOTE_SYMBOL } from "@/config/app";
import { usePoolReserves } from "./hooks";
import { MARKET } from "./market";
import {
  WINDOW_SECONDS,
  computePoolStats,
  computePrices,
  computeTokenStats,
  computeTvl,
  type PoolStat,
  type TokenStat,
  type WindowKey,
} from "./stats";

/** Dollar price of every token that has a funded pool with the quote token. */
export function usePrices(): ReadonlyMap<Address, number> | undefined {
  const reserves = usePoolReserves();
  return useMemo(
    () =>
      reserves.data === undefined
        ? undefined
        : computePrices(MARKET.tokens, MARKET.pools, reserves.data, QUOTE_SYMBOL),
    [reserves.data],
  );
}

/** Total value locked across every pool, in dollars. Undefined until reserves have loaded. */
export function useTotalTvl(): number | undefined {
  const reserves = usePoolReserves();
  return useMemo(() => {
    if (reserves.data === undefined) return undefined;
    const prices = computePrices(MARKET.tokens, MARKET.pools, reserves.data, QUOTE_SYMBOL);
    return computeTvl(MARKET.tokens, MARKET.pools, reserves.data, prices).total;
  }, [reserves.data]);
}

/** Per-token statistics for a time window, recomputed every second. */
export function useTokenStats(windowKey: WindowKey): TokenStat[] | undefined {
  const reserves = usePoolReserves();
  const { swaps, syncs, now } = useMarketData();
  return useMemo(() => {
    if (reserves.data === undefined || now === 0) return undefined;
    const prices = computePrices(MARKET.tokens, MARKET.pools, reserves.data, QUOTE_SYMBOL);
    return computeTokenStats({
      tokens: MARKET.tokens,
      pools: MARKET.pools,
      reserves: reserves.data,
      swaps,
      syncs,
      prices,
      now,
      windowSeconds: WINDOW_SECONDS[windowKey],
    });
  }, [reserves.data, swaps, syncs, now, windowKey]);
}

/** Per-pool liquidity and volume for a time window, recomputed every second. */
export function usePoolStats(windowKey: WindowKey): PoolStat[] | undefined {
  const reserves = usePoolReserves();
  const { swaps, now } = useMarketData();
  return useMemo(() => {
    if (reserves.data === undefined || now === 0) return undefined;
    const prices = computePrices(MARKET.tokens, MARKET.pools, reserves.data, QUOTE_SYMBOL);
    return computePoolStats({
      tokens: MARKET.tokens,
      pools: MARKET.pools,
      reserves: reserves.data,
      swaps,
      prices,
      now,
      windowSeconds: WINDOW_SECONDS[windowKey],
    });
  }, [reserves.data, swaps, now, windowKey]);
}
