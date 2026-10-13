import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { pairAbi, routerAbi, tokenAbi } from "./abi.ts";
import {
  LOCAL_CHAIN_ID,
  assertLocalChain,
  loadDeployment,
  loadEnvFile,
  parseOptions,
  parsePrivateKey,
  parsePrivateKeys,
  projectPath,
  readEnv,
  requireLocalRpc,
  type TokenInfo,
} from "./config.ts";
import { computeAmountIn, nextDelayMs, pickSizeClass } from "./plan.ts";
import { createRng, pickOne } from "./random.ts";

const MAX_CONSECUTIVE_FAILURES = 10;
const MIN_GAS_BALANCE = parseEther("0.5");
const DEADLINE_SECONDS = 300n;
const SLIPPAGE_NUMERATOR = 995n;
const SLIPPAGE_DENOMINATOR = 1000n;
const TOP_UP_MULTIPLIER = 3n;

function log(message: string): void {
  console.log(`${new Date().toISOString()}  ${message}`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof short === "string" && short.length > 0) return short;
    const firstLine = error.message.split("\n")[0];
    return firstLine === undefined || firstLine === "" ? error.name : firstLine;
  }
  return String(error);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2), Date.now() % 4_294_967_296);
  loadEnvFile(projectPath("../../.env"));

  const rpcUrl = readEnv("RPC_URL");
  requireLocalRpc(rpcUrl);
  const funderKey = parsePrivateKey(readEnv("DEPLOYER_PRIVATE_KEY"), "DEPLOYER_PRIVATE_KEY");
  const walletKeys = parsePrivateKeys(readEnv("SIMULATOR_PRIVATE_KEYS"), "SIMULATOR_PRIVATE_KEYS");
  if (walletKeys.length < 2) throw new Error("Provide at least two simulator wallets");

  const deployment = loadDeployment();
  if (deployment.chainId !== LOCAL_CHAIN_ID) {
    throw new Error(`The deployment file is for chain ${deployment.chainId}, not ${LOCAL_CHAIN_ID}`);
  }

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 100 });
  assertLocalChain(await publicClient.getChainId());

  const routerCode = await publicClient.getCode({ address: deployment.router });
  if (routerCode === undefined || routerCode === "0x") {
    throw new Error(
      "No router found at the configured address. Start a fresh Anvil and run the deploy script first.",
    );
  }

  const funder = privateKeyToAccount(funderKey);
  const funderClient = createWalletClient({ account: funder, chain: foundry, transport });
  const makeWallet = (key: Hex, index: number) => {
    const account = privateKeyToAccount(key);
    return {
      label: `w${index + 1}`,
      account,
      client: createWalletClient({ account, chain: foundry, transport }),
    };
  };
  type Wallet = ReturnType<typeof makeWallet>;
  const wallets = walletKeys.map(makeWallet);

  for (const wallet of wallets) {
    if (wallet.account.address === funder.address) {
      throw new Error("A simulator wallet must not be the deployer account");
    }
    const gasBalance = await publicClient.getBalance({ address: wallet.account.address });
    if (gasBalance < MIN_GAS_BALANCE) {
      throw new Error(`Simulator wallet ${wallet.label} has too little ETH for gas`);
    }
  }

  const tokensByAddress = new Map<Address, TokenInfo>(
    deployment.tokens.map((token): [Address, TokenInfo] => [token.address, token]),
  );
  const tokenOf = (address: Address): TokenInfo => {
    const token = tokensByAddress.get(address);
    if (token === undefined) throw new Error(`Unknown token ${address}`);
    return token;
  };

  const confirm = async (hash: Hex, what: string): Promise<void> => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
    if (receipt.status !== "success") throw new Error(`${what} reverted (${hash})`);
  };

  const ensureBalance = async (token: TokenInfo, wallet: Wallet, needed: bigint): Promise<void> => {
    const balance = await publicClient.readContract({
      address: token.address,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    });
    if (balance >= needed) return;
    const topUp = needed * TOP_UP_MULTIPLIER - balance;
    const { request } = await publicClient.simulateContract({
      account: funder,
      address: token.address,
      abi: tokenAbi,
      functionName: "transfer",
      args: [wallet.account.address, topUp],
    });
    await confirm(await funderClient.writeContract(request), `funding ${token.symbol}`);
    log(`funded ${wallet.label} with ${formatUnits(topUp, token.decimals)} ${token.symbol}`);
  };

  const rng = createRng(options.seed);

  const runSwap = async (): Promise<"done" | "skipped"> => {
    const wallet = pickOne(rng, wallets);
    const pair = pickOne(rng, deployment.pairs);
    const zeroForOne = rng() < 0.5;
    const tokenIn = tokenOf(zeroForOne ? pair.token0 : pair.token1);
    const tokenOut = tokenOf(zeroForOne ? pair.token1 : pair.token0);

    const [reserve0, reserve1] = await publicClient.readContract({
      address: pair.address,
      abi: pairAbi,
      functionName: "getReserves",
    });
    const sizeClass = pickSizeClass(rng);
    const amountIn = computeAmountIn(zeroForOne ? reserve0 : reserve1, sizeClass, rng);
    if (amountIn === 0n) return "skipped";

    await ensureBalance(tokenIn, wallet, amountIn);

    const path = [tokenIn.address, tokenOut.address];
    const quoted = await publicClient.readContract({
      address: deployment.router,
      abi: routerAbi,
      functionName: "getAmountsOut",
      args: [amountIn, path],
    });
    const quotedOut = quoted.at(-1);
    if (quotedOut === undefined || quotedOut === 0n) return "skipped";
    const minOut = (quotedOut * SLIPPAGE_NUMERATOR) / SLIPPAGE_DENOMINATOR;

    // Exact approval: the router pulls exactly amountIn, so no allowance is left over.
    const approval = await publicClient.simulateContract({
      account: wallet.account,
      address: tokenIn.address,
      abi: tokenAbi,
      functionName: "approve",
      args: [deployment.router, amountIn],
    });
    await confirm(await wallet.client.writeContract(approval.request), "approve");

    const block = await publicClient.getBlock();
    const swap = await publicClient.simulateContract({
      account: wallet.account,
      address: deployment.router,
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [amountIn, minOut, path, wallet.account.address, block.timestamp + DEADLINE_SECONDS],
    });
    const hash = await wallet.client.writeContract(swap.request);
    await confirm(hash, "swap");

    const amountOut = swap.result.at(-1) ?? 0n;
    log(
      `swap  ${wallet.label}  ${sizeClass.padEnd(6)}  ` +
        `${formatUnits(amountIn, tokenIn.decimals)} ${tokenIn.symbol} -> ` +
        `${formatUnits(amountOut, tokenOut.decimals)} ${tokenOut.symbol}  ${hash.slice(0, 10)}`,
    );
    return "done";
  };

  const controller = new AbortController();
  const stop = (): void => {
    log("stopping after the current swap");
    controller.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  log(`connected to chain ${LOCAL_CHAIN_ID}, router ${deployment.router}`);
  log(`wallets ${wallets.length}, pools ${deployment.pairs.length}, seed ${options.seed}`);
  log("press Ctrl+C to stop");

  let completed = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  while (!controller.signal.aborted) {
    if (options.maxSwaps !== undefined && completed >= options.maxSwaps) break;
    try {
      if ((await runSwap()) === "done") completed++;
      consecutiveFailures = 0;
    } catch (error) {
      failed++;
      consecutiveFailures++;
      log(`swap failed: ${describeError(error)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(`Stopping after ${MAX_CONSECUTIVE_FAILURES} failures in a row`);
      }
    }
    if (controller.signal.aborted) break;
    if (options.maxSwaps !== undefined && completed >= options.maxSwaps) break;
    await sleep(nextDelayMs(rng), controller.signal);
  }
  log(`stopped: ${completed} swaps completed, ${failed} failed`);
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
