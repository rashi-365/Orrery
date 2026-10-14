import { Panel } from "@/components/Panel";
import { SwapPanel } from "@/components/SwapPanel";

export default function SwapPage() {
  return (
    <div className="mx-auto max-w-xl">
      <Panel index="05" title="Swap">
        <SwapPanel />
      </Panel>
    </div>
  );
}
