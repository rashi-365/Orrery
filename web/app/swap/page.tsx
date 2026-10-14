import { Panel } from "@/components/Panel";
import { Stat } from "@/components/Stat";
import { DEFAULT_CHAIN_ID, SWAP_FEE_PERCENT } from "@/config/app";
import { getDeployment } from "@/config/deployment";

export default function SwapPage() {
  const deployment = getDeployment(DEFAULT_CHAIN_ID);

  return (
    <div className="mx-auto max-w-2xl">
      <Panel index="05" title="Swap">
        <p className="font-mono text-data uppercase text-muted">
          Trading is not enabled in this build.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Stat label="Swap fee" value={SWAP_FEE_PERCENT} unit="%" />
          <Stat label="Router" value={deployment === undefined ? null : "DEPLOYED"} />
        </div>
      </Panel>
    </div>
  );
}
