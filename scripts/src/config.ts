import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, type Address, type Hex } from "viem";

export const LOCAL_CHAIN_ID = 31337;

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const USAGE = "Usage: npm run simulate -- [--max-swaps N] [--seed N]";

export type TokenInfo = {
  readonly symbol: string;
  readonly decimals: number;
  readonly address: Address;
};

export type PairInfo = {
  readonly address: Address;
  readonly token0: Address;
  readonly token1: Address;
};

export type Deployment = {
  readonly chainId: number;
  readonly factory: Address;
  readonly router: Address;
  readonly tokens: readonly TokenInfo[];
  readonly pairs: readonly PairInfo[];
};

export type Options = {
  readonly maxSwaps: number | undefined;
  readonly seed: number;
};

/** Absolute path of a file given relative to this source file. */
export function projectPath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/** Loads variables from a .env file if it exists. Variables already set win. */
export function loadEnvFile(path: string): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value.trim();
}

/** Validates a private key. The error never contains the value. */
export function parsePrivateKey(value: string, label: string): Hex {
  const trimmed = value.trim();
  if (!PRIVATE_KEY_PATTERN.test(trimmed)) {
    throw new Error(`${label} is not a valid 32-byte hex private key`);
  }
  return trimmed as Hex;
}

/** Validates a comma-separated list of private keys and rejects duplicates. */
export function parsePrivateKeys(value: string, label: string): Hex[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) throw new Error(`${label} contains no keys`);
  const keys = parts.map((part) => parsePrivateKey(part, label));
  const unique = new Set(keys.map((key) => key.toLowerCase()));
  if (unique.size !== keys.length) throw new Error(`${label} contains a duplicate key`);
  return keys;
}

/** Throws unless the RPC URL points at this machine. */
export function requireLocalRpc(rpcUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rpcUrl).hostname;
  } catch {
    throw new Error("RPC_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`The simulator only runs against a local node, but RPC_URL host is ${hostname}`);
  }
}

/** Throws unless the connected chain is local Anvil. */
export function assertLocalChain(chainId: number): void {
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error(`The simulator only runs on chain ${LOCAL_CHAIN_ID}, but the node reports ${chainId}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Deployment file: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readAddress(record: Record<string, unknown>, key: string): Address {
  const value = record[key];
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error(`Deployment file: ${key} must be an address`);
  }
  return getAddress(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Deployment file: ${key} must be a non-empty string`);
  }
  return value;
}

function readInt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Deployment file: ${key} must be a non-negative integer`);
  }
  return value;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Deployment file: ${key} must be an array`);
  return value as unknown[];
}

/** Validates the JSON written by the deploy script. */
export function parseDeployment(raw: unknown): Deployment {
  const root = asRecord(raw, "root");

  const tokens: TokenInfo[] = readArray(root, "tokens").map((item, index) => {
    const token = asRecord(item, `tokens[${index}]`);
    return {
      symbol: readString(token, "symbol"),
      decimals: readInt(token, "decimals"),
      address: readAddress(token, "address"),
    };
  });
  const known = new Set<Address>(tokens.map((token) => token.address));
  if (known.size !== tokens.length) throw new Error("Deployment file: duplicate token address");

  const pairs: PairInfo[] = readArray(root, "pairs").map((item, index) => {
    const pair = asRecord(item, `pairs[${index}]`);
    const parsed: PairInfo = {
      address: readAddress(pair, "address"),
      token0: readAddress(pair, "token0"),
      token1: readAddress(pair, "token1"),
    };
    if (!known.has(parsed.token0) || !known.has(parsed.token1)) {
      throw new Error(`Deployment file: pairs[${index}] uses an unknown token`);
    }
    return parsed;
  });

  return {
    chainId: readInt(root, "chainId"),
    factory: readAddress(root, "factory"),
    router: readAddress(root, "router"),
    tokens,
    pairs,
  };
}

/** Reads the local deployment written by the deploy script. */
export function loadDeployment(): Deployment {
  const path = projectPath("../../web/config/deployments/31337.json");
  return parseDeployment(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function parseCount(value: string | undefined, flag: string, min: number): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${flag} needs a whole number\n${USAGE}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be at least ${min}\n${USAGE}`);
  }
  return parsed;
}

/** Parses command-line flags. */
export function parseOptions(argv: readonly string[], defaultSeed: number): Options {
  let maxSwaps: number | undefined;
  let seed = defaultSeed;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max-swaps") {
      maxSwaps = parseCount(argv[i + 1], "--max-swaps", 1);
      i++;
    } else if (arg === "--seed") {
      seed = parseCount(argv[i + 1], "--seed", 0);
      i++;
    } else {
      throw new Error(`Unknown argument: ${String(arg)}\n${USAGE}`);
    }
  }
  return { maxSwaps, seed };
}
