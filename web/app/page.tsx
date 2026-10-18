import { DeploymentNotice } from "@/components/DeploymentNotice";
import { FeedStatus, LiveFeed } from "@/components/LiveFeed";
import { OrbitDiagram } from "@/components/OrbitDiagram";
import { Panel } from "@/components/Panel";
import { RankedPanel } from "@/components/RankedPanel";
import { Stat } from "@/components/Stat";
import { DEFAULT_CHAIN_ID, SWAP_FEE_PERCENT } from "@/config/app";
import { getMarket } from "@/lib/market";

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label uppercase text-muted">{label}</dt>
      <dd className="break-all text-text">{address}</dd>
    </div>
  );
}

export default function HomePage() {
  const { deployment, tokens, pools } = getMarket();

  if (deployment === undefined) {
    return (
      <div className="mx-auto max-w-7xl">
        <Panel index="01" title="Network">
          <p className="font-mono text-data uppercase text-muted">
            {`NO DEPLOYMENT CONFIGURED FOR CHAIN ${DEFAULT_CHAIN_ID}`}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <DeploymentNotice />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel index="01" title="Token network">
            <OrbitDiagram tokens={tokens} edges={deployment.pairs} />
          </Panel>
          <Panel index="02" title="Live feed" action={<FeedStatus />} flush>
            <LiveFeed />
          </Panel>
        </div>

        <div className="space-y-6">
          <RankedPanel />
          <Panel index="04" title="Deployment">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Chain" value={String(deployment.chainId)} />
              <Stat label="Swap fee" value={SWAP_FEE_PERCENT} unit="%" />
              <Stat label="Tokens" value={String(tokens.length)} />
              <Stat label="Pools" value={String(pools.length)} />
            </div>
            <dl className="mt-6 space-y-3 font-mono text-data">
              <AddressRow label="Factory" address={deployment.factory} />
              <AddressRow label="Router" address={deployment.router} />
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
