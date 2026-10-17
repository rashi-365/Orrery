import { DeploymentNotice } from "@/components/DeploymentNotice";
import { LiquidityWorkspace } from "@/components/LiquidityWorkspace";

export default function LiquidityPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <DeploymentNotice />
      <LiquidityWorkspace />
    </div>
  );
}
