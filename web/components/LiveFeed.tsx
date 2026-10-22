"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatAmount, formatBps } from "@/lib/amount";
import { formatClock, shortHash } from "@/lib/display";
import { recentSwaps } from "@/lib/events";
import { TOKENS_BY_ADDRESS } from "@/lib/market";
import { useMarketData } from "./MarketDataProvider";

const FEED_ROWS = 8;

/** Connection state of the event reader, for a panel header. */
export function FeedStatus() {
  const { status } = useMarketData();
  const label = status === "live" ? "LIVE" : status === "connecting" ? "CONNECTING" : "OFFLINE";
  return (
    <span className="flex items-center gap-2 font-mono text-label uppercase text-muted">
      <span
        aria-hidden="true"
        className={status === "live" ? "h-1.5 w-1.5 bg-accent" : "h-1.5 w-1.5 bg-muted"}
      />
      {label}
    </span>
  );
}

/** The most recent swaps: time, short tx hash, route, amounts and price impact. New rows slide in. */
export function LiveFeed() {
  const { swaps } = useMarketData();
  const recent = recentSwaps(swaps, FEED_ROWS);

  if (recent.length === 0) {
    return (
      <p className="px-4 py-6 font-mono text-label uppercase text-muted">
        No swaps yet. Run the simulator or trade on the Swap page.
      </p>
    );
  }

  const rows = recent.flatMap((swap) => {
    const tokenIn = TOKENS_BY_ADDRESS.get(swap.tokenIn);
    const tokenOut = TOKENS_BY_ADDRESS.get(swap.tokenOut);
    if (tokenIn === undefined || tokenOut === undefined) return [];
    return [
      <motion.li
        key={swap.id}
        layout="position"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
      >
        <span className="text-muted">{formatClock(swap.timestamp)}</span>
        <span className="text-muted" title={swap.txHash}>
          {shortHash(swap.txHash)}
        </span>
        <span className="text-text">{`${tokenIn.symbol} > ${tokenOut.symbol}`}</span>
        <span className="text-text">
          {`${formatAmount(swap.amountIn, tokenIn.decimals, 4)} > ${formatAmount(swap.amountOut, tokenOut.decimals, 4)}`}
        </span>
        <span className="ml-auto text-muted">
          {swap.priceImpactBps === null ? "--" : `${formatBps(swap.priceImpactBps)}%`}
        </span>
      </motion.li>,
    ];
  });

  return (
    <ul className="divide-y divide-line font-mono text-data">
      <AnimatePresence initial={false}>{rows}</AnimatePresence>
    </ul>
  );
}
