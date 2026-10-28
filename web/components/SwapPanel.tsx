"use client";

import { useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import { usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { DEFAULT_CHAIN_ID, SWAP_FEE_PERCENT } from "@/config/app";
import type { TokenConfig } from "@/config/deployment";
import { erc20Abi, routerAbi } from "@/lib/abi";
import { formatAmount, formatBps, parseAmount } from "@/lib/amount";
import { findBestRoute, minAfterSlippage } from "@/lib/amm";
import { assertWalletChain, describeError } from "@/lib/errors";
import { cx, shortAddress } from "@/lib/format";
import {
  useAllowance,
  usePoolReserves,
  useRefreshChainData,
  useTokenBalances,
  useWalletStatus,
} from "@/lib/hooks";
import {
  DEADLINE_SECONDS,
  DEFAULT_SLIPPAGE_BPS,
  MAX_PRICE_IMPACT_BPS,
  WARN_PRICE_IMPACT_BPS,
} from "@/lib/limits";
import { MARKET } from "@/lib/market";
import { waitForSuccess } from "@/lib/tx";
import { AmountInput } from "./AmountInput";
import { FaucetRow } from "./FaucetRow";
import { PhaseMessage, type TxPhase } from "./PhaseMessage";
import { SlippageControl } from "./SlippageControl";
import { TokenSelect } from "./TokenSelect";

type Action = {
  readonly label: string;
  readonly disabled: boolean;
  readonly run?: () => Promise<void> | void;
};

type SwapFormProps = {
  readonly router: Address;
  readonly tokens: readonly TokenConfig[];
  readonly initialFrom: Address;
  readonly initialTo: Address;
};

function DetailRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={cx("text-right", warn ? "text-down" : "text-text")}>{value}</dd>
    </div>
  );
}

function SwapForm({ router, tokens, initialFrom, initialTo }: SwapFormProps) {
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  const refresh = useRefreshChainData();

  const [from, setFrom] = useState<Address>(initialFrom);
  const [to, setTo] = useState<Address>(initialTo);
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [phase, setPhase] = useState<TxPhase>({ kind: "idle" });

  const byAddress = useMemo(() => {
    const map = new Map<Address, TokenConfig>();
    tokens.forEach((token) => map.set(token.address, token));
    return map;
  }, [tokens]);
  const inputToken = byAddress.get(from);
  const outputToken = byAddress.get(to);

  const reserves = usePoolReserves();
  const balances = useTokenBalances(address);
  const allowance = useAllowance(from, address, router);

  const amountIn = inputToken === undefined ? null : parseAmount(amountText, inputToken.decimals);
  const route = useMemo(() => {
    if (amountIn === null || amountIn === 0n || reserves.data === undefined) return null;
    return findBestRoute(MARKET.pools, reserves.data, from, to, amountIn);
  }, [amountIn, reserves.data, from, to]);
  const minOut = route === null ? null : minAfterSlippage(route.amountOut, BigInt(slippageBps));
  const balance = balances.data?.get(from);

  function balanceLabel(token: TokenConfig | undefined, value: bigint | undefined): string {
    if (token === undefined || value === undefined) return "BAL --";
    return `BAL ${formatAmount(value, token.decimals)}`;
  }

  function onFromChange(next: Address) {
    if (next === to) setTo(from);
    setFrom(next);
    setPhase({ kind: "idle" });
  }

  function onToChange(next: Address) {
    if (next === from) setFrom(to);
    setTo(next);
    setPhase({ kind: "idle" });
  }

  function flip() {
    setFrom(to);
    setTo(from);
    setAmountText("");
    setPhase({ kind: "idle" });
  }

  async function runApprove() {
    if (
      walletClient === undefined ||
      publicClient === undefined ||
      address === undefined ||
      inputToken === undefined ||
      amountIn === null
    ) {
      return;
    }
    setPhase({ kind: "working", label: "SIMULATING APPROVAL" });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      // Exact approval: only what this swap needs, never an unlimited allowance.
      const call = {
        address: inputToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amountIn],
      } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM APPROVAL IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR APPROVAL TO CONFIRM" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setPhase({
        kind: "done",
        message: `Approved exactly ${formatAmount(amountIn, inputToken.decimals)} ${inputToken.symbol} for the router. This is only an approval. Click the button again to continue.`,
        hash,
      });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  async function runSwap() {
    if (
      walletClient === undefined ||
      publicClient === undefined ||
      address === undefined ||
      inputToken === undefined ||
      outputToken === undefined ||
      amountIn === null ||
      route === null ||
      minOut === null
    ) {
      return;
    }
    setPhase({ kind: "working", label: "SIMULATING SWAP" });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      const block = await publicClient.getBlock();
      const deadline = block.timestamp + BigInt(DEADLINE_SECONDS);
      const call = {
        address: router,
        abi: routerAbi,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, minOut, route.path, address, deadline],
      } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM SWAP IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR SWAP TO CONFIRM" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setAmountText("");
      setPhase({
        kind: "done",
        message: `Swapped ${formatAmount(amountIn, inputToken.decimals)} ${inputToken.symbol} for about ${formatAmount(route.amountOut, outputToken.decimals)} ${outputToken.symbol}.`,
        hash,
      });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  function resolveAction(): Action {
    if (!isConnected) return { label: "Connect a wallet", disabled: true };
    if (wrongNetwork) {
      return {
        label: `Switch to chain ${DEFAULT_CHAIN_ID}`,
        disabled: switching,
        run: () => switchChain({ chainId: DEFAULT_CHAIN_ID }),
      };
    }
    if (inputToken === undefined || outputToken === undefined) {
      return { label: "Select tokens", disabled: true };
    }
    if (amountText === "") return { label: "Enter an amount", disabled: true };
    if (amountIn === null) return { label: "Invalid amount", disabled: true };
    if (amountIn === 0n) return { label: "Enter an amount", disabled: true };
    if (reserves.isError) return { label: "Pools unavailable", disabled: true };
    if (reserves.data === undefined) return { label: "Loading pools", disabled: true };
    if (route === null) return { label: "No route for this trade", disabled: true };
    if (balance === undefined) return { label: "Loading balance", disabled: true };
    if (amountIn > balance) return { label: `Insufficient ${inputToken.symbol}`, disabled: true };
    if (route.priceImpactBps > MAX_PRICE_IMPACT_BPS) {
      return { label: "Price impact too high", disabled: true };
    }
    if (allowance.data === undefined) return { label: "Checking approval", disabled: true };
    if (allowance.data < amountIn) {
      return {
        label: `Approve ${formatAmount(amountIn, inputToken.decimals)} ${inputToken.symbol}`,
        disabled: false,
        run: runApprove,
      };
    }
    return { label: "Swap", disabled: false, run: runSwap };
  }

  const action = resolveAction();
  const busy = phase.kind === "working";
  const needsApproval =
    amountIn !== null && allowance.data !== undefined && allowance.data < amountIn;

  const rate =
    route !== null && inputToken !== undefined && outputToken !== undefined && amountIn !== null
      ? (route.amountOut * 10n ** BigInt(inputToken.decimals)) / amountIn
      : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-label uppercase text-muted">
          <span>From</span>
          <span>{balanceLabel(inputToken, balance)}</span>
        </div>
        <div className="flex gap-2">
          <div className="w-36 shrink-0">
            <TokenSelect id="swap-from" label="Token to sell" tokens={tokens} value={from} onChange={onFromChange} />
          </div>
          <AmountInput
            id="swap-amount"
            label="Amount to sell"
            value={amountText}
            onChange={(value) => {
              setAmountText(value);
              setPhase({ kind: "idle" });
            }}
            invalid={amountText !== "" && amountIn === null}
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={balance === undefined || inputToken === undefined}
            onClick={() => {
              if (balance !== undefined && inputToken !== undefined) {
                setAmountText(formatUnits(balance, inputToken.decimals));
              }
            }}
            className="border border-line px-2 py-1 font-mono text-label uppercase text-muted hover:text-text disabled:cursor-not-allowed"
          >
            Max
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <button
          type="button"
          onClick={flip}
          aria-label="Swap the two tokens"
          className="border border-line-strong p-2 text-muted hover:border-accent hover:text-accent"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1 V10 M3 10 L1 8 M3 10 L5 8 M9 11 V2 M9 2 L7 4 M9 2 L11 4" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-label uppercase text-muted">
          <span>To (estimated)</span>
          <span>{balanceLabel(outputToken, balances.data?.get(to))}</span>
        </div>
        <div className="flex gap-2">
          <div className="w-36 shrink-0">
            <TokenSelect id="swap-to" label="Token to buy" tokens={tokens} value={to} onChange={onToChange} />
          </div>
          <AmountInput
            id="swap-output"
            label="Estimated amount received"
            readOnly
            value={route !== null && outputToken !== undefined ? formatAmount(route.amountOut, outputToken.decimals) : ""}
          />
        </div>
      </div>

      <SlippageControl value={slippageBps} onChange={setSlippageBps} />

      {route !== null && inputToken !== undefined && outputToken !== undefined && minOut !== null && (
        <dl className="space-y-2 border-t border-line pt-4 font-mono text-data">
          <DetailRow
            label="Route"
            value={route.path.map((token) => byAddress.get(token)?.symbol ?? "?").join(" > ")}
          />
          {rate !== null && (
            <DetailRow
              label="Rate"
              value={`1 ${inputToken.symbol} = ${formatAmount(rate, outputToken.decimals)} ${outputToken.symbol}`}
            />
          )}
          <DetailRow
            label="Price impact"
            value={`${formatBps(route.priceImpactBps)}%`}
            warn={route.priceImpactBps >= WARN_PRICE_IMPACT_BPS}
          />
          <DetailRow
            label="Pool fee"
            value={`${SWAP_FEE_PERCENT}% x ${route.hops.length}`}
          />
          <DetailRow
            label="Minimum received"
            value={`${formatAmount(minOut, outputToken.decimals)} ${outputToken.symbol}`}
          />
        </dl>
      )}

      {needsApproval && inputToken !== undefined && amountIn !== null && (
        <p className="border border-line px-3 py-2 font-mono text-label uppercase text-muted">
          {`Approval needed: exactly ${formatAmount(amountIn, inputToken.decimals)} ${inputToken.symbol} for router ${shortAddress(router)}`}
        </p>
      )}

      <button
        type="button"
        disabled={action.disabled || busy}
        onClick={() => void action.run?.()}
        className="w-full border border-accent py-3 font-sans text-sm font-semibold uppercase tracking-label text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
      >
        {action.label}
      </button>

      <PhaseMessage phase={phase} />

      {inputToken !== undefined && <FaucetRow key={inputToken.address} token={inputToken} />}
    </div>
  );
}

type SwapPanelProps = {
  /** Optional symbols from the page address, such as ?from=LUNA&to=TERR. */
  readonly fromSymbol?: string | undefined;
  readonly toSymbol?: string | undefined;
};

export function SwapPanel({ fromSymbol, toSymbol }: SwapPanelProps = {}) {
  const { deployment, tokens } = MARKET;
  const first = tokens[0];
  const second = tokens[1];

  if (deployment === undefined || first === undefined || second === undefined) {
    return (
      <p className="font-mono text-data uppercase text-muted">
        {`NO DEPLOYMENT CONFIGURED FOR CHAIN ${DEFAULT_CHAIN_ID}`}
      </p>
    );
  }
  const bySymbol = (symbol: string | undefined): TokenConfig | undefined =>
    symbol === undefined
      ? undefined
      : tokens.find((token) => token.symbol.toUpperCase() === symbol.toUpperCase());
  const start = bySymbol(fromSymbol) ?? first;
  let end = bySymbol(toSymbol) ?? second;
  if (end.address === start.address) {
    end = tokens.find((token) => token.address !== start.address) ?? second;
  }
  return (
    <SwapForm
      key={`${start.address}-${end.address}`}
      router={deployment.router}
      tokens={tokens}
      initialFrom={start.address}
      initialTo={end.address}
    />
  );
}
