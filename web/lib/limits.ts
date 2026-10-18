export const DEFAULT_SLIPPAGE_BPS = 50;
export const MIN_SLIPPAGE_BPS = 1;
export const MAX_SLIPPAGE_BPS = 500;
export const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;
export const HIGH_SLIPPAGE_BPS = 100;

/** Price impact at which the number turns red. */
export const WARN_PRICE_IMPACT_BPS = 300;
/** Price impact above which swapping is blocked. */
export const MAX_PRICE_IMPACT_BPS = 1500;

export const DEADLINE_SECONDS = 1200;
export const POLL_INTERVAL_MS = 4000;
export const MAX_ROUTE_HOPS = 3;

/** Whole tokens given by each faucet claim. Must match MockToken.FAUCET_WHOLE_TOKENS. */
export const FAUCET_WHOLE_TOKENS = 1000;

/** How far back the live feed looks on first load: 48 hours of 12-second blocks. */
export const BACKFILL_BLOCKS = 14_400n;
/** Block range per getLogs request, small enough for public RPC providers. */
export const LOG_CHUNK_BLOCKS = 2_000n;
export const EVENT_POLL_MS = 1000;
/** Events older than this are dropped: the 24h window plus the 24h before it, for deltas. */
export const RETENTION_SECONDS = 172_800;
export const TIMESTAMP_CONCURRENCY = 20;
