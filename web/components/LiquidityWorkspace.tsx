"use client";

import { useState } from "react";
import type { Address } from "viem";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import { MARKET } from "@/lib/market";
import { LiquidityForm, type LiquidityMode } from "./LiquidityForm";
import { Panel } from "./Panel";
import { PositionsPanel } from "./PositionsPanel";

/** The liquidity form beside the list of the account's positions. */
export function LiquidityWorkspace() {
  const { deployment, pools } = MARKET;
  const first = pools[0];
  const [selected, setSelected] = useState<Address | undefined>(first?.address);
  const [mode, setMode] = useState<LiquidityMode>("add");

  if (deployment === undefined || first === undefined) {
    return (
      <p className="font-mono text-data uppercase text-muted">
        {`NO DEPLOYMENT CONFIGURED FOR CHAIN ${DEFAULT_CHAIN_ID}`}
      </p>
    );
  }

  const pool = pools.find((item) => item.address === selected) ?? first;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <Panel index="06" title="Liquidity">
        <LiquidityForm
          key={pool.address}
          router={deployment.router}
          pool={pool}
          pools={pools}
          mode={mode}
          onModeChange={setMode}
          onPoolChange={setSelected}
        />
      </Panel>
      <Panel index="07" title="Your positions" flush>
        <PositionsPanel
          onSelect={(address) => {
            setSelected(address);
            setMode("remove");
          }}
        />
      </Panel>
    </div>
  );
}
