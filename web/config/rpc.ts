/** JSON-RPC endpoint of the local chain. A URL, not a secret. */
export const LOCAL_RPC_URL = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

/** JSON-RPC endpoint of Sepolia, used when the app is built for it. A URL, not a secret. */
export const SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
