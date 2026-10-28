import { DeploymentNotice } from "@/components/DeploymentNotice";
import { Panel } from "@/components/Panel";
import { SwapPanel } from "@/components/SwapPanel";

type SwapPageProps = {
  searchParams: { from?: string | string[]; to?: string | string[] };
};

export default function SwapPage({ searchParams }: SwapPageProps) {
  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const to = typeof searchParams.to === "string" ? searchParams.to : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <DeploymentNotice />
      <Panel index="05" title="Swap">
        <SwapPanel fromSymbol={from} toSymbol={to} />
      </Panel>
    </div>
  );
}
