import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import { erc20Abi, pairAbi } from "./abi";
import type { Reserves } from "./amm";
import { POLL_INTERVAL_MS } from "./limits";
import { MARKET } from "./market";

/** Wallet connection state relative to the chain the app talks to. */
export function useWalletStatus() {
  const { address, isConnected, chainId } = useAccount();
  return { address, isConnected, wrongNetwork: isConnected && chainId !== DEFAULT_CHAIN_ID };
}

/** Reserves of every pool, refreshed every few seconds. Keyed by pool address. */
export function usePoolReserves() {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  return useQuery({
    queryKey: ["reserves", DEFAULT_CHAIN_ID],
    enabled: publicClient !== undefined && MARKET.pools.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: async (): Promise<Map<Address, Reserves>> => {
      if (publicClient === undefined) throw new Error("No RPC client");
      const entries = await Promise.all(
        MARKET.pools.map(async (pool) => {
          const [reserve0, reserve1] = await publicClient.readContract({
            address: pool.address,
            abi: pairAbi,
            functionName: "getReserves",
          });
          const value: Reserves = { reserve0, reserve1 };
          return [pool.address, value] as const;
        }),
      );
      return new Map(entries);
    },
  });
}

/** Balance of every token for one account. */
export function useTokenBalances(account: Address | undefined) {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  return useQuery({
    queryKey: ["balances", DEFAULT_CHAIN_ID, account],
    enabled: publicClient !== undefined && account !== undefined,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: async (): Promise<Map<Address, bigint>> => {
      if (publicClient === undefined || account === undefined) throw new Error("Not ready");
      const entries = await Promise.all(
        MARKET.tokens.map(async (token) => {
          const balance = await publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          });
          return [token.address, balance] as const;
        }),
      );
      return new Map(entries);
    },
  });
}

/** How much of a token the owner has approved the spender to move. */
export function useAllowance(
  token: Address | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
) {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  return useQuery({
    queryKey: ["allowance", DEFAULT_CHAIN_ID, token, owner, spender],
    enabled:
      publicClient !== undefined &&
      token !== undefined &&
      owner !== undefined &&
      spender !== undefined,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: async (): Promise<bigint> => {
      if (
        publicClient === undefined ||
        token === undefined ||
        owner === undefined ||
        spender === undefined
      ) {
        throw new Error("Not ready");
      }
      return publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      });
    },
  });
}

/** Returns a function that refetches reserves, balances, allowances and positions. */
export function useRefreshChainData(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all(
      ["reserves", "balances", "allowance", "positions"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }, [queryClient]);
}

export type Position = {
  readonly balance: bigint;
  readonly totalSupply: bigint;
};

/** LP balance and total supply for every pool, for one account. */
export function usePositions(account: Address | undefined) {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  return useQuery({
    queryKey: ["positions", DEFAULT_CHAIN_ID, account],
    enabled: publicClient !== undefined && account !== undefined && MARKET.pools.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: async (): Promise<Map<Address, Position>> => {
      if (publicClient === undefined || account === undefined) throw new Error("Not ready");
      const entries = await Promise.all(
        MARKET.pools.map(async (pool) => {
          const [balance, totalSupply] = await Promise.all([
            publicClient.readContract({
              address: pool.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }),
            publicClient.readContract({
              address: pool.address,
              abi: erc20Abi,
              functionName: "totalSupply",
            }),
          ]);
          const position: Position = { balance, totalSupply };
          return [pool.address, position] as const;
        }),
      );
      return new Map(entries);
    },
  });
}

export type RouterStatus = "checking" | "ready" | "missing" | "unreachable";

/** Whether the configured router has code on the connected chain. */
export function useRouterStatus(router: Address | undefined): RouterStatus {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  const query = useQuery({
    queryKey: ["router-code", DEFAULT_CHAIN_ID, router],
    enabled: publicClient !== undefined && router !== undefined,
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      if (publicClient === undefined || router === undefined) throw new Error("Not ready");
      const code = await publicClient.getCode({ address: router });
      return code !== undefined && code !== "0x";
    },
  });
  if (query.isError) return "unreachable";
  if (query.data === undefined) return "checking";
  return query.data ? "ready" : "missing";
}
