"use client";

import type { Address } from "viem";
import { formatAmount } from "@/lib/amount";
import { usePoolReserves, usePositions, useWalletStatus } from "@/lib/hooks";
import { formatShare, withdrawAmounts } from "@/lib/liquidity";
import { MARKET, TOKENS_BY_ADDRESS } from "@/lib/market";

function Message({ text }: { readonly text: string }) {
  return <p className="px-4 py-6 font-mono text-label uppercase text-muted">{text}</p>;
}

/** Every pool the connected account holds LP tokens in, with what the position is worth. */
export function PositionsPanel({ onSelect }: { readonly onSelect: (pool: Address) => void }) {
  const { address, isConnected } = useWalletStatus();
  const positions = usePositions(address);
  const reserves = usePoolReserves();

  if (!isConnected) return <Message text="Connect a wallet to see your positions." />;
  if (positions.isError) return <Message text="Positions are unavailable right now." />;
  if (positions.data === undefined || reserves.data === undefined) {
    return <Message text="Loading positions" />;
  }

  const positionMap = positions.data;
  const reserveMap = reserves.data;
  const rows = MARKET.pools.flatMap((pool) => {
    const position = positionMap.get(pool.address);
    const poolReserves = reserveMap.get(pool.address);
    const token0 = TOKENS_BY_ADDRESS.get(pool.token0);
    const token1 = TOKENS_BY_ADDRESS.get(pool.token1);
    if (
      position === undefined ||
      poolReserves === undefined ||
      token0 === undefined ||
      token1 === undefined ||
      position.balance === 0n
    ) {
      return [];
    }
    const amounts = withdrawAmounts(
      position.balance,
      poolReserves.reserve0,
      poolReserves.reserve1,
      position.totalSupply,
    );
    return [{ pool, position, token0, token1, amounts }];
  });

  if (rows.length === 0) {
    return <Message text="No liquidity positions yet. Add liquidity to a pool to get started." />;
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map(({ pool, position, token0, token1, amounts }) => (
        <li key={pool.address}>
          <button
            type="button"
            onClick={() => onSelect(pool.address)}
            aria-label={`Manage ${pool.label} position`}
            className="block w-full px-4 py-3 text-left hover:bg-bg"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-sans text-sm font-semibold uppercase tracking-label text-text">
                {pool.label}
              </span>
              <span className="font-mono text-data text-text">
                {formatShare(position.balance, position.totalSupply)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap justify-between gap-x-4 font-mono text-data text-muted">
              <span>{`${formatAmount(position.balance, 18, 12)} LP`}</span>
              <span>
                {`${formatAmount(amounts.amount0, token0.decimals)} ${token0.symbol} + ${formatAmount(amounts.amount1, token1.decimals)} ${token1.symbol}`}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
