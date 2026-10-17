"use client";

import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import type { TokenConfig } from "@/config/deployment";
import { erc20Abi, routerAbi } from "@/lib/abi";
import { formatAmount, parseAmount } from "@/lib/amount";
import { minAfterSlippage } from "@/lib/amm";
import { assertWalletChain, describeError } from "@/lib/errors";
import { cx, shortAddress } from "@/lib/format";
import {
  useAllowance,
  usePoolReserves,
  usePositions,
  useRefreshChainData,
  useTokenBalances,
  useWalletStatus,
} from "@/lib/hooks";
import { DEADLINE_SECONDS, DEFAULT_SLIPPAGE_BPS } from "@/lib/limits";
import {
  computeAddAmounts,
  deriveDesired,
  estimateShares,
  formatShare,
  liquidityForPercent,
  parsePercent,
  planAllowances,
  projectedShare,
  withdrawAmounts,
} from "@/lib/liquidity";
import { TOKENS_BY_ADDRESS, type PoolRow } from "@/lib/market";
import { waitForSuccess } from "@/lib/tx";
import { AmountInput } from "./AmountInput";
import { FaucetRow } from "./FaucetRow";
import { PhaseMessage, type TxPhase } from "./PhaseMessage";
import { SlippageControl } from "./SlippageControl";

export type LiquidityMode = "add" | "remove";

type LiquidityFormProps = {
  readonly router: Address;
  readonly pool: PoolRow;
  readonly pools: readonly PoolRow[];
  readonly mode: LiquidityMode;
  readonly onModeChange: (mode: LiquidityMode) => void;
  readonly onPoolChange: (address: Address) => void;
};

type Action = {
  readonly label: string;
  readonly disabled: boolean;
  readonly run?: () => Promise<void> | void;
};

const LP_DECIMALS = 18;
const LP_DISPLAY_FRACTION = 12;
const PERCENT_PRESETS = [25, 50, 75, 100] as const;

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{value}</dd>
    </div>
  );
}

function balanceLabel(token: TokenConfig | undefined, value: bigint | undefined): string {
  if (token === undefined || value === undefined) return "BAL --";
  return `BAL ${formatAmount(value, token.decimals)}`;
}

function PoolSelect({
  pools,
  value,
  onChange,
}: {
  readonly pools: readonly PoolRow[];
  readonly value: Address;
  readonly onChange: (address: Address) => void;
}) {
  return (
    <div className="relative">
      <label htmlFor="liquidity-pool" className="sr-only">
        Pool
      </label>
      <select
        id="liquidity-pool"
        value={value}
        onChange={(event) => {
          const match = pools.find((pool) => pool.address === event.target.value);
          if (match !== undefined) onChange(match.address);
        }}
        className="w-full appearance-none rounded border border-line bg-bg py-2 pl-3 pr-8 font-sans text-sm font-semibold uppercase tracking-label text-text focus:border-teal focus:outline-none"
      >
        {pools.map((pool) => (
          <option key={pool.address} value={pool.address} className="bg-bg text-text">
            {pool.label}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  );
}

function AmountRow({
  id,
  symbol,
  balance,
  value,
  onChange,
  invalid,
}: {
  readonly id: string;
  readonly symbol: string;
  readonly balance: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-mono text-label uppercase text-muted">
        <span>{symbol}</span>
        <span>{balance}</span>
      </div>
      <AmountInput
        id={id}
        label={`Amount of ${symbol}`}
        value={value}
        onChange={onChange}
        invalid={invalid}
      />
    </div>
  );
}

export function LiquidityForm({
  router,
  pool,
  pools,
  mode,
  onModeChange,
  onPoolChange,
}: LiquidityFormProps) {
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  const refresh = useRefreshChainData();

  const token0 = TOKENS_BY_ADDRESS.get(pool.token0);
  const token1 = TOKENS_BY_ADDRESS.get(pool.token1);

  const [typedText, setTypedText] = useState("");
  const [typedSide, setTypedSide] = useState<0 | 1>(0);
  const [percentText, setPercentText] = useState("25");
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [phase, setPhase] = useState<TxPhase>({ kind: "idle" });

  const reserves = usePoolReserves();
  const balances = useTokenBalances(address);
  const positions = usePositions(address);
  const allowance0 = useAllowance(pool.token0, address, router);
  const allowance1 = useAllowance(pool.token1, address, router);
  const lpAllowance = useAllowance(pool.address, address, router);

  const poolReserves = reserves.data?.get(pool.address);
  const position = positions.data?.get(pool.address);
  const reserve0 = poolReserves?.reserve0 ?? 0n;
  const reserve1 = poolReserves?.reserve1 ?? 0n;
  const slippage = BigInt(slippageBps);

  // Add: whichever side the user typed fixes the amount; the other side follows the pool ratio.
  const typedToken = typedSide === 0 ? token0 : token1;
  const typedParsed = typedToken === undefined ? null : parseAmount(typedText, typedToken.decimals);
  const desired =
    typedParsed === null ? null : deriveDesired(typedSide, typedParsed, reserve0, reserve1);
  const deposit =
    desired === null ? null : computeAddAmounts(desired.amount0, desired.amount1, reserve0, reserve1);
  const plan =
    deposit === null || typedParsed === null
      ? null
      : planAllowances(typedSide, typedParsed, deposit, slippage);
  const totalSupply = position?.totalSupply;
  const shares =
    deposit === null || totalSupply === undefined
      ? null
      : estimateShares(deposit.amountA, deposit.amountB, reserve0, reserve1, totalSupply);

  // Remove: a percentage of the position.
  const percent = parsePercent(percentText);
  const burn =
    position === undefined || percent === null ? null : liquidityForPercent(position.balance, percent);
  const out =
    burn === null || position === undefined
      ? null
      : withdrawAmounts(burn, reserve0, reserve1, position.totalSupply);

  const text0 =
    typedSide === 0
      ? typedText
      : desired !== null && token0 !== undefined
        ? formatUnits(desired.amount0, token0.decimals)
        : "";
  const text1 =
    typedSide === 1
      ? typedText
      : desired !== null && token1 !== undefined
        ? formatUnits(desired.amount1, token1.decimals)
        : "";

  function onAmountChange(side: 0 | 1, value: string) {
    setTypedSide(side);
    setTypedText(value);
    setPhase({ kind: "idle" });
  }

  function changeMode(next: LiquidityMode) {
    setPhase({ kind: "idle" });
    onModeChange(next);
  }

  function changePercent(value: string) {
    setPercentText(value);
    setPhase({ kind: "idle" });
  }

  async function approveExact(token: Address, symbol: string, decimals: number, amount: bigint) {
    if (walletClient === undefined || publicClient === undefined || address === undefined) return;
    setPhase({ kind: "working", label: `SIMULATING ${symbol} APPROVAL` });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      const call = {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, amount],
      } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM APPROVAL IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR APPROVAL TO CONFIRM" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setPhase({
        kind: "done",
        message: `Approved exactly ${formatAmount(amount, decimals, LP_DISPLAY_FRACTION)} ${symbol} for the router.`,
        hash,
      });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  async function runAdd() {
    if (walletClient === undefined || publicClient === undefined || address === undefined) return;
    if (token0 === undefined || token1 === undefined || desired === null || deposit === null) return;
    setPhase({ kind: "working", label: "SIMULATING ADD LIQUIDITY" });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      const block = await publicClient.getBlock();
      const deadline = block.timestamp + BigInt(DEADLINE_SECONDS);
      const call = {
        address: router,
        abi: routerAbi,
        functionName: "addLiquidity",
        args: [
          pool.token0,
          pool.token1,
          desired.amount0,
          desired.amount1,
          minAfterSlippage(deposit.amountA, slippage),
          minAfterSlippage(deposit.amountB, slippage),
          address,
          deadline,
        ],
      } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR CONFIRMATION" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setTypedText("");
      setPhase({
        kind: "done",
        message: `Added about ${formatAmount(deposit.amountA, token0.decimals)} ${token0.symbol} and ${formatAmount(deposit.amountB, token1.decimals)} ${token1.symbol}.`,
        hash,
      });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  async function runRemove() {
    if (walletClient === undefined || publicClient === undefined || address === undefined) return;
    if (token0 === undefined || token1 === undefined || burn === null || out === null) return;
    setPhase({ kind: "working", label: "SIMULATING REMOVE LIQUIDITY" });
    try {
      await assertWalletChain(walletClient, DEFAULT_CHAIN_ID);
      const block = await publicClient.getBlock();
      const deadline = block.timestamp + BigInt(DEADLINE_SECONDS);
      const call = {
        address: router,
        abi: routerAbi,
        functionName: "removeLiquidity",
        args: [
          pool.token0,
          pool.token1,
          burn,
          minAfterSlippage(out.amount0, slippage),
          minAfterSlippage(out.amount1, slippage),
          address,
          deadline,
        ],
      } as const;
      await publicClient.simulateContract({ ...call, account: address });
      setPhase({ kind: "working", label: "CONFIRM IN YOUR WALLET" });
      const hash = await walletClient.writeContract(call);
      setPhase({ kind: "working", label: "WAITING FOR CONFIRMATION" });
      await waitForSuccess(publicClient, hash);
      void refresh();
      setPhase({
        kind: "done",
        message: `Removed liquidity and received about ${formatAmount(out.amount0, token0.decimals)} ${token0.symbol} and ${formatAmount(out.amount1, token1.decimals)} ${token1.symbol}.`,
        hash,
      });
    } catch (error) {
      setPhase({ kind: "error", message: describeError(error) });
    }
  }

  function resolveAdd(t0: TokenConfig, t1: TokenConfig): Action {
    if (reserve0 === 0n || reserve1 === 0n) return { label: "Pool is empty", disabled: true };
    if (typedText === "") return { label: "Enter an amount", disabled: true };
    if (typedParsed === null) return { label: "Invalid amount", disabled: true };
    if (typedParsed === 0n) return { label: "Enter an amount", disabled: true };
    if (desired === null || deposit === null || plan === null) {
      return { label: "Amount too small", disabled: true };
    }
    if (deposit.amountA === 0n || deposit.amountB === 0n) {
      return { label: "Amount too small", disabled: true };
    }
    if (shares === null) return { label: "Loading pool supply", disabled: true };
    if (shares === 0n) return { label: "Amount too small", disabled: true };

    const balance0 = balances.data?.get(pool.token0);
    const balance1 = balances.data?.get(pool.token1);
    if (balance0 === undefined || balance1 === undefined) {
      return { label: "Loading balance", disabled: true };
    }
    if (plan.need0 > balance0) return { label: `Insufficient ${t0.symbol}`, disabled: true };
    if (plan.need1 > balance1) return { label: `Insufficient ${t1.symbol}`, disabled: true };

    const approved0 = allowance0.data;
    const approved1 = allowance1.data;
    if (approved0 === undefined || approved1 === undefined) {
      return { label: "Checking approvals", disabled: true };
    }
    if (approved0 < plan.need0) {
      return {
        label: `Approve ${formatAmount(plan.approve0, t0.decimals)} ${t0.symbol}`,
        disabled: false,
        run: () => approveExact(pool.token0, t0.symbol, t0.decimals, plan.approve0),
      };
    }
    if (approved1 < plan.need1) {
      return {
        label: `Approve ${formatAmount(plan.approve1, t1.decimals)} ${t1.symbol}`,
        disabled: false,
        run: () => approveExact(pool.token1, t1.symbol, t1.decimals, plan.approve1),
      };
    }
    return { label: "Add liquidity", disabled: false, run: runAdd };
  }

  function resolveRemove(): Action {
    if (positions.isError) return { label: "Positions unavailable", disabled: true };
    if (position === undefined) return { label: "Loading position", disabled: true };
    if (position.balance === 0n) return { label: "No position in this pool", disabled: true };
    if (percent === null) return { label: "Enter 1 to 100 percent", disabled: true };
    if (burn === null || out === null) return { label: "Loading position", disabled: true };
    if (burn === 0n || out.amount0 === 0n || out.amount1 === 0n) {
      return { label: "Amount too small", disabled: true };
    }
    const approved = lpAllowance.data;
    if (approved === undefined) return { label: "Checking approval", disabled: true };
    if (approved < burn) {
      return {
        label: `Approve ${formatAmount(burn, LP_DECIMALS, LP_DISPLAY_FRACTION)} LP`,
        disabled: false,
        run: () => approveExact(pool.address, "LP", LP_DECIMALS, burn),
      };
    }
    return { label: "Remove liquidity", disabled: false, run: runRemove };
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
    if (token0 === undefined || token1 === undefined) {
      return { label: "Select a pool", disabled: true };
    }
    if (reserves.isError) return { label: "Pools unavailable", disabled: true };
    if (poolReserves === undefined) return { label: "Loading pools", disabled: true };
    return mode === "add" ? resolveAdd(token0, token1) : resolveRemove();
  }

  function approvalText(amount: bigint, need: bigint, token: TokenConfig): string {
    const headroom = amount > need ? " (includes your slippage tolerance)" : "";
    return `Approval needed: exactly ${formatAmount(amount, token.decimals)} ${token.symbol} for router ${shortAddress(router)}${headroom}`;
  }

  let approvalNote: string | null = null;
  if (
    mode === "add" &&
    plan !== null &&
    token0 !== undefined &&
    token1 !== undefined &&
    allowance0.data !== undefined &&
    allowance1.data !== undefined
  ) {
    if (allowance0.data < plan.need0) approvalNote = approvalText(plan.approve0, plan.need0, token0);
    else if (allowance1.data < plan.need1) approvalNote = approvalText(plan.approve1, plan.need1, token1);
  }
  if (
    mode === "remove" &&
    burn !== null &&
    lpAllowance.data !== undefined &&
    lpAllowance.data < burn
  ) {
    approvalNote = `Approval needed: exactly ${formatAmount(burn, LP_DECIMALS, LP_DISPLAY_FRACTION)} LP for router ${shortAddress(router)}`;
  }

  const action = resolveAction();
  const busy = phase.kind === "working";
  const rate =
    token0 !== undefined && token1 !== undefined && reserve0 > 0n
      ? (reserve1 * 10n ** BigInt(token0.decimals)) / reserve0
      : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <span className="font-mono text-label uppercase text-muted">Pool</span>
        <PoolSelect pools={pools} value={pool.address} onChange={onPoolChange} />
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Liquidity action">
        {(["add", "remove"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => changeMode(item)}
            className={cx(
              "border py-2 font-mono text-label uppercase",
              mode === item ? "border-teal text-teal" : "border-line text-muted hover:text-text",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {mode === "add" ? (
        <div className="space-y-4">
          <AmountRow
            id="liq-amount-0"
            symbol={pool.symbol0}
            balance={balanceLabel(token0, balances.data?.get(pool.token0))}
            value={text0}
            onChange={(value) => onAmountChange(0, value)}
            invalid={typedSide === 0 && typedText !== "" && typedParsed === null}
          />
          <AmountRow
            id="liq-amount-1"
            symbol={pool.symbol1}
            balance={balanceLabel(token1, balances.data?.get(pool.token1))}
            value={text1}
            onChange={(value) => onAmountChange(1, value)}
            invalid={typedSide === 1 && typedText !== "" && typedParsed === null}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-label uppercase text-muted">Remove</span>
            {PERCENT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={percentText === String(preset)}
                onClick={() => changePercent(String(preset))}
                className={cx(
                  "border px-2 py-1 font-mono text-label",
                  percentText === String(preset)
                    ? "border-teal text-teal"
                    : "border-line text-muted hover:text-text",
                )}
              >
                {`${preset}%`}
              </button>
            ))}
            <label htmlFor="liquidity-percent" className="sr-only">
              Custom percentage to remove
            </label>
            <input
              id="liquidity-percent"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="CUSTOM %"
              value={PERCENT_PRESETS.some((p) => String(p) === percentText) ? "" : percentText}
              aria-invalid={percentText !== "" && percent === null}
              onChange={(event) => {
                if (/^\d{0,3}$/.test(event.target.value)) changePercent(event.target.value);
              }}
              className="w-24 rounded border border-line bg-transparent px-2 py-1 font-mono text-label uppercase text-text placeholder:text-muted focus:border-teal focus:outline-none"
            />
          </div>
          {percentText !== "" && percent === null && (
            <p className="font-mono text-label uppercase text-muted">Use a whole number from 1 to 100</p>
          )}
        </div>
      )}

      <SlippageControl value={slippageBps} onChange={setSlippageBps} />

      {mode === "add" && deposit !== null && token0 !== undefined && token1 !== undefined && (
        <dl className="space-y-2 border-t border-line pt-4 font-mono text-data">
          {rate !== null && (
            <DetailRow
              label="Pool rate"
              value={`1 ${token0.symbol} = ${formatAmount(rate, token1.decimals)} ${token1.symbol}`}
            />
          )}
          <DetailRow
            label="Deposit"
            value={`${formatAmount(deposit.amountA, token0.decimals)} ${token0.symbol} + ${formatAmount(deposit.amountB, token1.decimals)} ${token1.symbol}`}
          />
          <DetailRow
            label="Minimum deposit"
            value={`${formatAmount(minAfterSlippage(deposit.amountA, slippage), token0.decimals)} ${token0.symbol} + ${formatAmount(minAfterSlippage(deposit.amountB, slippage), token1.decimals)} ${token1.symbol}`}
          />
          {shares !== null && (
            <DetailRow
              label="Estimated LP tokens"
              value={formatAmount(shares, LP_DECIMALS, LP_DISPLAY_FRACTION)}
            />
          )}
          {shares !== null && totalSupply !== undefined && (
            <DetailRow
              label="Share of pool after"
              value={projectedShare(position?.balance ?? 0n, shares, totalSupply)}
            />
          )}
        </dl>
      )}

      {mode === "remove" &&
        position !== undefined &&
        position.balance > 0n &&
        burn !== null &&
        out !== null &&
        token0 !== undefined &&
        token1 !== undefined && (
          <dl className="space-y-2 border-t border-line pt-4 font-mono text-data">
            <DetailRow
              label="Your position"
              value={`${formatAmount(position.balance, LP_DECIMALS, LP_DISPLAY_FRACTION)} LP (${formatShare(position.balance, position.totalSupply)})`}
            />
            <DetailRow
              label="Removing"
              value={`${formatAmount(burn, LP_DECIMALS, LP_DISPLAY_FRACTION)} LP`}
            />
            <DetailRow
              label="You receive (estimated)"
              value={`${formatAmount(out.amount0, token0.decimals)} ${token0.symbol} + ${formatAmount(out.amount1, token1.decimals)} ${token1.symbol}`}
            />
            <DetailRow
              label="Minimum received"
              value={`${formatAmount(minAfterSlippage(out.amount0, slippage), token0.decimals)} ${token0.symbol} + ${formatAmount(minAfterSlippage(out.amount1, slippage), token1.decimals)} ${token1.symbol}`}
            />
            <DetailRow
              label="Share of pool after"
              value={formatShare(position.balance - burn, position.totalSupply - burn)}
            />
          </dl>
        )}

      {approvalNote !== null && (
        <p className="border border-line px-3 py-2 font-mono text-label uppercase text-muted">
          {approvalNote}
        </p>
      )}

      <button
        type="button"
        disabled={action.disabled || busy}
        onClick={() => void action.run?.()}
        className="w-full border border-teal py-3 font-sans text-sm font-semibold uppercase tracking-label text-teal transition-colors hover:bg-teal hover:text-bg disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
      >
        {action.label}
      </button>

      <PhaseMessage phase={phase} />

      {mode === "add" && token0 !== undefined && token1 !== undefined && (
        <div className="space-y-4">
          <FaucetRow key={token0.address} token={token0} />
          <FaucetRow key={token1.address} token={token1} />
        </div>
      )}
    </div>
  );
}
