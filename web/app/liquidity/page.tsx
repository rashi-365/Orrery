import { Panel } from "@/components/Panel";
import { Stat } from "@/components/Stat";
import { DEFAULT_CHAIN_ID, SWAP_FEE_PERCENT } from "@/config/app";
import { getMarket } from "@/lib/market";

export default function LiquidityPage() {
  const { pools } = getMarket();

  return (
    <div className="mx-auto max-w-2xl">
      <Panel index="06" title="Liquidity">
        <p className="font-mono text-data uppercase text-muted">
          Liquidity management is not enabled in this build.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Stat label="Pools" value={String(pools.length)} />
          <Stat label="Swap fee" value={SWAP_FEE_PERCENT} unit="%" />
          <Stat label="Chain" value={String(DEFAULT_CHAIN_ID)} />
        </div>
      </Panel>
    </div>
  );
}
