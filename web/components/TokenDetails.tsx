"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Address } from "viem";
import { QUOTE_SYMBOL } from "@/config/app";
import { formatClock, formatUsd } from "@/lib/display";
import { recentSwapsForToken } from "@/lib/events";
import { MARKET } from "@/lib/market";
import { swapValueUsd } from "@/lib/stats";
import { usePoolStats, useTokenStats } from "@/lib/useMarketStats";
import { useMarketData } from "./MarketDataProvider";
import { Panel } from "./Panel";

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-data">
      <span className="text-muted">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}

const BUTTON =
  "block rounded-full border px-4 py-2 text-center font-mono text-label uppercase transition";

export function TradePanel({ symbol }: { readonly symbol: string }) {
  const quoted = symbol !== QUOTE_SYMBOL;
  const buy = quoted ? `/swap?from=${QUOTE_SYMBOL}&to=${symbol}` : "/swap";
  const sell = quoted ? `/swap?from=${symbol}&to=${QUOTE_SYMBOL}` : "/swap";
  return (
    <Panel title="Trade">
      <div className="grid grid-cols-2 gap-2">
        <Link href={buy} className={`${BUTTON} border-white/60 text-white hover:bg-white/10`}>
          {`Buy ${symbol}`}
        </Link>
        <Link href={sell} className={`${BUTTON} border-[#D65454] text-[#D65454] hover:bg-[#D65454]/10`}>
          {`Sell ${symbol}`}
        </Link>
      </div>
      <p className="mt-3 font-mono text-label uppercase text-muted">
        {`Swaps run through the ${QUOTE_SYMBOL} pool at a 0.30% fee`}
      </p>
    </Panel>
  );
}

export function TokenDetails({ symbol }: { readonly symbol: string }) {
  const stats = useTokenStats("1h");
  const poolStats = usePoolStats("1h");
  const { swaps, now } = useMarketData();

  const token = useMemo(() => MARKET.tokens.find((t) => t.symbol === symbol), [symbol]);
  const stat = useMemo(() => stats?.find((s) => s.token.symbol === symbol), [stats, symbol]);
  const symbols = useMemo(
    () => new Map(MARKET.tokens.map((t) => [t.address, t.symbol] as const)),
    [],
  );
  const labels = useMemo(
    () => new Map(MARKET.pools.map((p) => [p.address, p.label] as const)),
    [],
  );

  const swapCount = useMemo(() => {
    if (token === undefined || now === 0) return 0;
    const cutoff = now - 3600;
    return swaps.filter(
      (s) => s.timestamp >= cutoff && (s.tokenIn === token.address || s.tokenOut === token.address),
    ).length;
  }, [swaps, token, now]);

  const pools = useMemo(() => {
    if (token === undefined || poolStats === undefined) return [];
    return poolStats
      .filter((s) => s.pool.token0 === token.address || s.pool.token1 === token.address)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 6)
      .map((s) => ({
        id: s.pool.address,
        label: labels.get(s.pool.address) ?? "?",
        tvl: s.tvlUsd,
        volume: s.volumeUsd,
      }));
  }, [token, poolStats, labels]);

  const trades = useMemo(() => {
    if (token === undefined || stats === undefined) return [];
    const prices = new Map<Address, number>();
    for (const s of stats) {
      if (s.priceUsd !== null) prices.set(s.token.address, s.priceUsd);
    }
    const tokenMap = new Map(MARKET.tokens.map((t) => [t.address, t] as const));
    return recentSwapsForToken(swaps, token.address, 6).map((swap) => ({
      id: swap.id,
      time: formatClock(swap.timestamp),
      route: `${symbols.get(swap.tokenIn) ?? "?"} > ${symbols.get(swap.tokenOut) ?? "?"}`,
      value: swapValueUsd(swap, tokenMap, prices),
    }));
  }, [token, stats, swaps, symbols]);

  return (
    <Panel title="Details">
      <div className="space-y-1.5">
        <Row label="Price" value={stat?.priceUsd == null ? "--" : formatUsd(stat.priceUsd)} />
        <Row label="TVL" value={stat === undefined ? "--" : formatUsd(stat.tvlUsd)} />
        <Row label="Volume 1h" value={stat === undefined ? "--" : formatUsd(stat.current.volumeUsd)} />
        <Row label="Swaps 1h" value={String(swapCount)} />
      </div>

      <p className="mb-2 mt-5 font-mono text-label uppercase text-muted">{`Pools ${pools.length}`}</p>
      <div className="space-y-1.5">
        {pools.length === 0 && <p className="font-mono text-data text-muted">--</p>}
        {pools.map((pool) => (
          <div key={pool.id} className="flex items-center justify-between gap-3 font-mono text-data">
            <span className="text-text">{pool.label}</span>
            <span className="text-muted">{`${formatUsd(pool.tvl)} / ${formatUsd(pool.volume)}`}</span>
          </div>
        ))}
        {pools.length > 0 && (
          <p className="font-mono text-label uppercase text-muted">TVL / volume 1h</p>
        )}
      </div>

      <p className="mb-2 mt-5 font-mono text-label uppercase text-muted">Recent trades</p>
      <div className="space-y-1.5">
        {trades.length === 0 && <p className="font-mono text-data text-muted">NO TRADES YET</p>}
        {trades.map((trade) => (
          <div key={trade.id} className="flex items-center justify-between gap-3 font-mono text-data">
            <span className="text-muted">{trade.time}</span>
            <span className="text-text">{trade.route}</span>
            <span className="text-muted">{trade.value === null ? "--" : formatUsd(trade.value)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
