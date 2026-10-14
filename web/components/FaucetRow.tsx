"use client";

import { useState } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import type { TokenConfig } from "@/config/deployment";
import { faucetAbi } from "@/lib/abi";
import { assertWalletChain, describeError } from "@/lib/errors";
import { useRefreshChainData, useWalletStatus } from "@/lib/hooks";
import { FAUCET_WHOLE_TOKENS } from "@/lib/limits";
import { waitForSuccess } from "@/lib/tx";
import { PhaseMessage, type TxPhase } from "./PhaseMessage";

/** Claim button for the selected token's public test faucet. Key it by token to reset its state. */
export function FaucetRow({ token }: { readonly token: TokenConfig }) {
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  const refresh = useRefreshChainData();
  const [phase, setPhase] = useState<TxPhase>({ kind: "idle" });

  async function claim() {
    if (walletClient === undefined || publicClient === undefined || address === undefined) return;
    setPhase({ kind: "working", label: "SIMULATING CLAIM" });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      const call = { address: token.address, abi: faucetAbi, functionName: "faucet" } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR CONFIRMATION" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setPhase({ kind: "done", message: `Claimed ${FAUCET_WHOLE_TOKENS.toLocaleString("en-US")} ${token.symbol}.`, hash });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  const busy = phase.kind === "working";
  return (
    <div className="space-y-2 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-label uppercase text-muted">Test tokens</span>
        <button
          type="button"
          disabled={!isConnected || wrongNetwork || busy}
          onClick={() => void claim()}
          className="border border-line-strong px-3 py-1 font-mono text-label uppercase text-text hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:text-muted"
        >
          {`Claim ${FAUCET_WHOLE_TOKENS.toLocaleString("en-US")} ${token.symbol}`}
        </button>
      </div>
      <PhaseMessage phase={phase} />
    </div>
  );
}
