import { DeploymentNotice } from "@/components/DeploymentNotice";
import { Panel } from "@/components/Panel";
import { SwapPanel } from "@/components/SwapPanel";

export default function SwapPage() {
  return (
    <div className="mx-auto max-w-xl">
      <DeploymentNotice />
      <Panel index="05" title="Swap">
        <SwapPanel />
      </Panel>
    </div>
  );
}
