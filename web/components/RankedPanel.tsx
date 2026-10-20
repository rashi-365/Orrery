"use client";

import Link from "next/link";
import type { Address } from "viem";
import { formatCount, formatDeltaPct, formatUsd } from "@/lib/display";
import { cx } from "@/lib/format";
import { MARKET } from "@/lib/market";
import {
  metricDeltaPct,
  metricValue,
  rankTokens,
  type Metric,
  type TokenStat,
  type WindowKey,
} from "@/lib/stats";
import { useTokenStats } from "@/lib/useMarketStats";
import { Panel } from "./Panel";

const METRICS: readonly { readonly id: Metric; readonly label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "tvl", label: "TVL" },
  { id: "swaps", label: "Swaps" },
  { id: "fees", label: "Fees" },
];

const WINDOWS: readonly WindowKey[] = ["5m", "1h", "24h"];
const VISIBLE_ROWS = 10;

type RankedPanelProps = {
  readonly metric: Metric;
  readonly onMetricChange: (metric: Metric) => void;
  readonly windowKey: WindowKey;
  readonly onWindowChange: (windowKey: WindowKey) => void;
  readonly selected: Address | undefined;
  readonly onSelect: (token: Address | undefined) => void;
};

function formatValue(metric: Metric, stat: TokenStat): string {
  const value = metricValue(stat, metric);
  return metric === "swaps" ? formatCount(value) : formatUsd(value);
}

function TokenMark({ symbol }: { readonly symbol: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center border border-line-strong font-mono text-[9px] uppercase tracking-normal text-text"
    >
      {symbol.slice(0, 2)}
    </span>
  );
}

function deltaClass(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 0.05) return "text-muted";
  return delta > 0 ? "text-up" : "text-down";
}

/** Ranked list of tokens by volume, TVL, swaps or fees over a time window. Rows select a token. */
export function RankedPanel({
  metric,
  onMetricChange,
  windowKey,
  onWindowChange,
  selected,
  onSelect,
}: RankedPanelProps) {
  const stats = useTokenStats(windowKey);
  const rows = stats === undefined ? undefined : rankTokens(stats, metric).slice(0, VISIBLE_ROWS);

  const caption =
    metric === "tvl"
      ? `Delta: liquidity change over the last ${windowKey}, at current prices`
      : `Delta: change against the previous ${windowKey}`;

  return (
    <Panel
      index="03"
      title={`Tokens ${MARKET.tokens.length}`}
      flush
      action={
        <Link href="/tokens" className="font-mono text-label uppercase text-accent">
          Explore all
        </Link>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="relative w-32">
          <label htmlFor="rank-metric" className="sr-only">
            Ranking metric
          </label>
          <select
            id="rank-metric"
            value={metric}
            onChange={(event) => {
              const next = METRICS.find((item) => item.id === event.target.value);
              if (next !== undefined) onMetricChange(next.id);
            }}
            className="w-full appearance-none rounded border border-line bg-bg py-1.5 pl-3 pr-8 font-mono text-label uppercase text-text focus:border-accent focus:outline-none"
          >
            {METRICS.map((item) => (
              <option key={item.id} value={item.id} className="bg-bg text-text">
                {item.label}
              </option>
            ))}
          </select>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          >
            <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time window">
          {WINDOWS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={windowKey === item}
              onClick={() => onWindowChange(item)}
              className={cx(
                "border px-2 py-1 font-mono text-label uppercase",
                windowKey === item
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:text-text",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {rows === undefined ? (
        <p className="px-4 py-6 font-mono text-label uppercase text-muted">Loading</p>
      ) : (
        <ol>
          {rows.map((stat, index) => {
            const delta = metricDeltaPct(stat, metric);
            const isSelected = selected === stat.token.address;
            return (
              <li key={stat.token.address}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(isSelected ? undefined : stat.token.address)}
                  className={cx(
                    "grid w-full grid-cols-[1.25rem_1.5rem_1fr_auto_4.5rem] items-center gap-3 border-b border-l-2 border-line px-4 py-2 text-left font-mono text-data hover:bg-bg",
                    isSelected ? "border-l-accent bg-bg" : "border-l-transparent",
                  )}
                >
                  <span className="text-muted">{index + 1}</span>
                  <TokenMark symbol={stat.token.symbol} />
                  <span className="font-sans text-sm font-semibold uppercase tracking-label text-text">
                    {stat.token.symbol}
                  </span>
                  <span className="text-right text-text">{formatValue(metric, stat)}</span>
                  <span className={cx("text-right", deltaClass(delta))}>{formatDeltaPct(delta)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="px-4 py-2 font-mono text-label uppercase text-muted">{caption}</p>
    </Panel>
  );
}
