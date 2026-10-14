import { DEFAULT_CHAIN_ID } from "@/config/app";
import { getDeployment } from "@/config/deployment";
import { shortAddress } from "@/lib/format";

export function StatusStrip() {
  const deployment = getDeployment(DEFAULT_CHAIN_ID);

  return (
    <footer className="border-t border-line px-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 font-mono text-label uppercase text-muted">
        <span>{`CHAIN ${DEFAULT_CHAIN_ID} // LOCAL`}</span>
        {deployment !== undefined && (
          <span>{`ROUTER ${shortAddress(deployment.router)}`}</span>
        )}
      </div>
    </footer>
  );
}
