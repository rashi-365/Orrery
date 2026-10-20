"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BlockNotFoundError, parseAbi, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { DEFAULT_CHAIN_ID } from "@/config/app";
import {
  buildEvents,
  indexPools,
  pruneSwaps,
  pruneSyncs,
  type PairLog,
  type SwapEvent,
  type SyncPoint,
} from "@/lib/events";
import {
  BACKFILL_BLOCKS,
  EVENT_POLL_MS,
  LOG_CHUNK_BLOCKS,
  RETENTION_SECONDS,
  TIMESTAMP_CONCURRENCY,
} from "@/lib/limits";
import { MARKET } from "@/lib/market";

const PAIR_EVENTS = parseAbi([
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
]);

export type FeedStatus = "connecting" | "live" | "offline";

type SwapListener = (swaps: readonly SwapEvent[]) => void;

type MarketData = {
  readonly swaps: readonly SwapEvent[];
  readonly syncs: readonly SyncPoint[];
  readonly status: FeedStatus;
  /** Current time in epoch seconds, ticking once a second. Zero until the page has mounted. */
  readonly now: number;
  /** Calls the listener with each batch of swaps that arrives after the first load. */
  readonly subscribe: (listener: SwapListener) => () => void;
};

const MarketDataContext = createContext<MarketData>({
  swaps: [],
  syncs: [],
  status: "connecting",
  now: 0,
  subscribe: () => () => undefined,
});

export function useMarketData(): MarketData {
  return useContext(MarketDataContext);
}

/**
 * Reads every Swap and Sync event from the pools: first a backfill of recent blocks, then a
 * check for new blocks every second. If the node restarts or the chain changes, it notices
 * (the last block it processed no longer matches) and starts over. One reader serves the
 * whole app.
 */
export function MarketDataProvider({ children }: { readonly children: ReactNode }) {
  const publicClient = usePublicClient({ chainId: DEFAULT_CHAIN_ID });
  const queryClient = useQueryClient();
  const [swaps, setSwaps] = useState<readonly SwapEvent[]>([]);
  const [syncs, setSyncs] = useState<readonly SyncPoint[]>([]);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [now, setNow] = useState(0);
  const listeners = useRef(new Set<SwapListener>());
  const subscribe = useCallback((listener: SwapListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const deployment = MARKET.deployment;
    if (publicClient === undefined || deployment === undefined) return;
    const client = publicClient;
    const poolIndex = indexPools(MARKET.pools);
    const addresses = MARKET.pools.map((pool) => pool.address);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let knownIds = new Set<string>();
    // False during the first backfill, so listeners only hear about swaps that happen live.
    let live = false;
    const cursor: { next: bigint | undefined; hash: Hex | undefined } = {
      next: undefined,
      hash: undefined,
    };

    setSwaps([]);
    setSyncs([]);
    setStatus("connecting");

    const reset = (): void => {
      cursor.next = undefined;
      cursor.hash = undefined;
      live = false;
      knownIds = new Set<string>();
      setSwaps([]);
      setSyncs([]);
    };

    const timestampsFor = async (blocks: readonly bigint[]): Promise<Map<bigint, number>> => {
      const result = new Map<bigint, number>();
      for (let i = 0; i < blocks.length; i += TIMESTAMP_CONCURRENCY) {
        const slice = blocks.slice(i, i + TIMESTAMP_CONCURRENCY);
        const fetched = await Promise.all(
          slice.map(async (blockNumber) => {
            const block = await client.getBlock({ blockNumber });
            return [blockNumber, Number(block.timestamp)] as const;
          }),
        );
        for (const [blockNumber, timestamp] of fetched) result.set(blockNumber, timestamp);
      }
      return result;
    };

    const fetchRange = async (from: bigint, to: bigint): Promise<PairLog[]> => {
      const logs = await client.getLogs({
        address: addresses,
        events: PAIR_EVENTS,
        fromBlock: from,
        toBlock: to,
        strict: true,
      });
      const parsed: PairLog[] = [];
      for (const log of logs) {
        const base = {
          address: log.address,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
          txHash: log.transactionHash,
        };
        if (log.eventName === "Swap") {
          parsed.push({
            ...base,
            kind: "Swap",
            amount0In: log.args.amount0In,
            amount1In: log.args.amount1In,
            amount0Out: log.args.amount0Out,
            amount1Out: log.args.amount1Out,
          });
        } else if (log.eventName === "Sync") {
          parsed.push({
            ...base,
            kind: "Sync",
            reserve0: log.args.reserve0,
            reserve1: log.args.reserve1,
          });
        }
      }
      return parsed;
    };

    const ingest = async (logs: readonly PairLog[]): Promise<boolean> => {
      if (logs.length === 0) return false;
      const blocks = Array.from(new Set(logs.map((log) => log.blockNumber)));
      const timestamps = await timestampsFor(blocks);
      if (cancelled) return false;

      const built = buildEvents(logs, poolIndex, timestamps);
      const freshSwaps = built.swaps.filter((swap) => !knownIds.has(swap.id));
      const freshSyncs = built.syncs.filter((sync) => !knownIds.has(sync.id));
      freshSwaps.forEach((swap) => knownIds.add(swap.id));
      freshSyncs.forEach((sync) => knownIds.add(sync.id));
      if (freshSwaps.length === 0 && freshSyncs.length === 0) return false;

      const cutoff = Math.floor(Date.now() / 1000) - RETENTION_SECONDS;
      setSwaps((previous) => pruneSwaps([...previous, ...freshSwaps], cutoff));
      setSyncs((previous) => pruneSyncs([...previous, ...freshSyncs], cutoff));
      if (live && freshSwaps.length > 0) {
        listeners.current.forEach((listener) => listener(freshSwaps));
      }
      return true;
    };

    const step = async (): Promise<void> => {
      const latest = await client.getBlockNumber();

      if (cursor.next !== undefined && cursor.hash !== undefined) {
        // The last block processed must still exist with the same hash. If not, the node
        // was restarted or the chain changed, so start over.
        try {
          const known = await client.getBlock({ blockNumber: cursor.next - 1n });
          if (known.hash !== cursor.hash) reset();
        } catch (error) {
          if (error instanceof BlockNotFoundError) reset();
          else throw error;
        }
      }

      if (cursor.next === undefined) {
        const floor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n;
        const deployed = BigInt(deployment.deployBlock);
        cursor.next = deployed > floor ? deployed : floor;
      }
      if (latest < cursor.next) return;

      let from = cursor.next;
      let changed = false;
      while (from <= latest) {
        if (cancelled) return;
        const last = from + LOG_CHUNK_BLOCKS - 1n;
        const to = last < latest ? last : latest;
        if (await ingest(await fetchRange(from, to))) changed = true;
        from = to + 1n;
      }

      const head = await client.getBlock({ blockNumber: latest });
      cursor.hash = head.hash;
      cursor.next = latest + 1n;
      live = true;
      // New events mean the reserves changed: refresh them now instead of at the next poll.
      if (changed) void queryClient.invalidateQueries({ queryKey: ["reserves"] });
    };

    const loop = async (): Promise<void> => {
      try {
        await step();
        if (!cancelled) setStatus("live");
      } catch {
        if (!cancelled) setStatus("offline");
      }
      if (!cancelled) timer = setTimeout(() => void loop(), EVENT_POLL_MS);
    };
    void loop();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [publicClient, queryClient]);

  const value = useMemo<MarketData>(
    () => ({ swaps, syncs, status, now, subscribe }),
    [swaps, syncs, status, now, subscribe],
  );
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}
