export const APP_NAME = "Orrery" as const;
export const APP_TAGLINE = "LIVE LIQUIDITY NETWORK" as const;

/** Chain the app reads: local Anvil, or Sepolia when NEXT_PUBLIC_CHAIN_ID=11155111 is set at build time. */
export const DEFAULT_CHAIN_ID: 31337 | 11155111 =
  process.env.NEXT_PUBLIC_CHAIN_ID === "11155111" ? 11155111 : 31337;

/** Swap fee charged by every pool, as a percentage. */
export const SWAP_FEE_PERCENT = "0.30" as const;

/** Token treated as one US dollar. Every other token is priced through its pool with this one. */
export const QUOTE_SYMBOL = "LUNA" as const;
