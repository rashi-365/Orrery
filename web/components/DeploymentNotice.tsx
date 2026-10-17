"use client";

import { DEFAULT_CHAIN_ID } from "@/config/app";
import { useRouterStatus } from "@/lib/hooks";
import { MARKET } from "@/lib/market";

/** Banner shown when the chain is unreachable or the configured contracts are not on it. */
export function DeploymentNotice() {
  const status = useRouterStatus(MARKET.deployment?.router);
  if (status === "checking" || status === "ready") return null;

  const message =
    status === "unreachable"
      ? "Cannot reach the chain node. Start Anvil, then reload the page."
      : `No contracts found at the configured addresses on chain ${DEFAULT_CHAIN_ID}. Start a fresh Anvil, run the deploy script, then reload the page.`;

  return (
    <p
      role="alert"
      className="mb-4 border border-line-strong px-3 py-2 font-mono text-data text-text"
    >
      <span className="text-muted">NOTICE // </span>
      {message}
    </p>
  );
}
