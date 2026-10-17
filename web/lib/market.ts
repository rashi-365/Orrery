import type { Address } from "viem";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import { getDeployment, type DeploymentConfig, type TokenConfig } from "@/config/deployment";

export type PoolRow = {
  readonly address: Address;
  readonly label: string;
  readonly symbol0: string;
  readonly symbol1: string;
  readonly token0: Address;
  readonly token1: Address;
};

export type Market = {
  readonly deployment: DeploymentConfig | undefined;
  readonly tokens: readonly TokenConfig[];
  readonly pools: readonly PoolRow[];
};

/** Tokens and pools from the deploy config, with pools labelled by token symbols. */
export function getMarket(): Market {
  const deployment = getDeployment(DEFAULT_CHAIN_ID);
  if (deployment === undefined) return { deployment, tokens: [], pools: [] };

  const symbols = new Map<Address, string>(
    deployment.tokens.map((token): [Address, string] => [token.address, token.symbol]),
  );
  const pools = deployment.pairs.map((pair): PoolRow => {
    const symbol0 = symbols.get(pair.token0) ?? "?";
    const symbol1 = symbols.get(pair.token1) ?? "?";
    return {
      address: pair.address,
      label: `${symbol0} / ${symbol1}`,
      symbol0,
      symbol1,
      token0: pair.token0,
      token1: pair.token1,
    };
  });
  return { deployment, tokens: deployment.tokens, pools };
}

/** Config-derived market, computed once: the deployment cannot change while the app runs. */
export const MARKET: Market = getMarket();

/** Token lookup by address. */
export const TOKENS_BY_ADDRESS: ReadonlyMap<Address, TokenConfig> = new Map(
  MARKET.tokens.map((token): [Address, TokenConfig] => [token.address, token]),
);
