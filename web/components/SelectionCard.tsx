import { formatCount, formatUsd } from "@/lib/display";
import type { TokenStat, WindowKey } from "@/lib/stats";
import { Kbd } from "./Kbd";

export type CardPool = {
  readonly id: string;
  readonly label: string;
  readonly tvlUsd: number;
  readonly volumeUsd: number;
};

export type CardTrade = {
  readonly id: string;
  readonly time: string;
  readonly route: string;
  readonly valueUsd: number | null;
};

type SelectionCardProps = {
  readonly stat: TokenStat;
  readonly windowKey: WindowKey;
  readonly pools: readonly CardPool[];
  readonly trades: readonly CardTrade[];
  readonly onClose: () => void;
};

const MAX_POOLS = 6;

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{children}</dd>
    </div>
  );
}

/** The locked token: its numbers for the window, its pools and its latest trades. */
export function SelectionCard({ stat, windowKey, pools, trades, onClose }: SelectionCardProps) {
  const net = stat.current.buyUsd - stat.current.sellUsd;
  const netText = `${net >= 0 ? "+" : "-"}${formatUsd(Math.abs(net))}`;

  return (
    <aside
      aria-label={`${stat.token.symbol} details`}
      className="absolute left-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto border border-line-strong bg-bg p-3 font-mono text-data"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-sm font-semibold uppercase tracking-label text-text">
          {stat.token.symbol}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-label uppercase text-muted hover:text-text"
        >
          Close <Kbd>Esc</Kbd>
        </button>
      </div>

      <dl className="mt-3 space-y-1">
        <Row label="Price">{stat.priceUsd === null ? "--" : formatUsd(stat.priceUsd)}</Row>
        <Row label="TVL">{formatUsd(stat.tvlUsd)}</Row>
        <Row label={`Volume ${windowKey}`}>{formatUsd(stat.current.volumeUsd)}</Row>
        <Row label={`Swaps ${windowKey}`}>{formatCount(stat.current.swaps)}</Row>
        <Row label="Net flow">
          <span className={net > 0 ? "text-up" : net < 0 ? "text-down" : "text-muted"}>{netText}</span>
        </Row>
      </dl>

      <p className="mt-4 text-label uppercase text-muted">{`Pools ${pools.length}`}</p>
      <ul className="mt-1 space-y-1">
        {pools.slice(0, MAX_POOLS).map((pool) => (
          <li key={pool.id} className="flex items-center justify-between gap-2">
            <span className="text-text">{pool.label}</span>
            <span className="text-muted">{`${formatUsd(pool.tvlUsd)} / ${formatUsd(pool.volumeUsd)}`}</span>
          </li>
        ))}
        {pools.length > MAX_POOLS && (
          <li className="text-label uppercase text-muted">{`+${pools.length - MAX_POOLS} more`}</li>
        )}
      </ul>
      <p className="mt-1 text-label uppercase text-muted">TVL / volume</p>

      <p className="mt-4 text-label uppercase text-muted">Recent trades</p>
      {trades.length === 0 ? (
        <p className="mt-1 text-label uppercase text-muted">None yet</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {trades.map((trade) => (
            <li key={trade.id} className="flex items-center justify-between gap-2">
              <span className="text-muted">{trade.time}</span>
              <span className="text-text">{trade.route}</span>
              <span className="text-muted">
                {trade.valueUsd === null ? "--" : formatUsd(trade.valueUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
