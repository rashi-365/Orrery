import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

export class WrongNetworkError extends Error {
  constructor(expected: number, actual: number) {
    super(`Your wallet is on chain ${actual}. Switch it to chain ${expected}.`);
    this.name = "WrongNetworkError";
  }
}

const REVERT_MESSAGES: Readonly<Record<string, string>> = {
  Expired: "The deadline passed before the transaction was mined. Try again.",
  InsufficientOutputAmount: "The price moved past your slippage limit. Try again or raise slippage.",
  ExcessiveInputAmount: "The price moved past your slippage limit. Try again or raise slippage.",
  InsufficientAAmount: "The price moved past your slippage limit. Try again or raise slippage.",
  InsufficientBAmount: "The price moved past your slippage limit. Try again or raise slippage.",
  InsufficientLiquidity: "The pool does not have enough liquidity for this.",
  InsufficientInputAmount: "The input amount is too small.",
  InsufficientAmount: "The amount is too small.",
  InsufficientLiquidityMinted: "The deposit is too small to mint any liquidity shares.",
  InsufficientLiquidityBurned: "The withdrawal is too small to return both tokens.",
  PairNotFound: "No pool exists for this pair.",
  InvalidPath: "That route is not valid.",
  IdenticalAddresses: "Choose two different tokens.",
  ZeroAddress: "An address was empty.",
  InvalidTo: "That recipient is not allowed.",
  KInvariant: "The pool rejected the trade because the price moved. Try again.",
  Overflow: "The pool's reserves would overflow.",
  ReentrancyGuardReentrantCall: "Blocked by the pool's reentrancy guard.",
  ERC20InsufficientBalance: "Your token balance is too low.",
  ERC20InsufficientAllowance: "The router's approval is too low. Approve first.",
  SafeERC20FailedOperation: "The token transfer failed.",
  FaucetCooldown: "You already claimed this token recently. Try again later.",
};

/** Plain-language message for a known contract error name. */
export function revertMessage(errorName: string | undefined): string | undefined {
  if (errorName === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(REVERT_MESSAGES, errorName)) return undefined;
  return REVERT_MESSAGES[errorName];
}

/** Turns any thrown value into one short sentence for the user. */
export function describeError(error: unknown): string {
  if (error instanceof WrongNetworkError) return error.message;
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError) !== null) {
      return "You rejected the request in your wallet.";
    }
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      return (
        revertMessage(reverted.data?.errorName) ??
        reverted.reason ??
        "The transaction would fail on-chain."
      );
    }
    return error.shortMessage;
  }
  if (error instanceof Error) return error.message.split("\n")[0] ?? "Something went wrong.";
  return "Something went wrong.";
}

/** Throws unless the wallet is on the chain the app talks to. Call before every write. */
export async function assertWalletChain(
  client: { getChainId: () => Promise<number> },
  expected: number,
): Promise<void> {
  const actual = await client.getChainId();
  if (actual !== expected) throw new WrongNetworkError(expected, actual);
}
