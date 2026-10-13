import { getAddress, isAddress, type Address } from "viem";
import local from "./deployments/31337.json";

export type TokenConfig = {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly address: Address;
};

export type PairConfig = {
  readonly address: Address;
  readonly token0: Address;
  readonly token1: Address;
};

export type DeploymentConfig = {
  readonly chainId: number;
  readonly deployBlock: number;
  readonly deployer: Address;
  readonly factory: Address;
  readonly router: Address;
  readonly tokens: readonly TokenConfig[];
  readonly pairs: readonly PairConfig[];
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Deployment config: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readAddress(record: Record<string, unknown>, key: string): Address {
  const value = record[key];
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error(`Deployment config: ${key} must be an address`);
  }
  return getAddress(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Deployment config: ${key} must be a non-empty string`);
  }
  return value;
}

function readInt(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Deployment config: ${key} must be a non-negative integer`);
  }
  return value;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Deployment config: ${key} must be an array`);
  }
  return value as unknown[];
}

/** Validates raw deploy-script JSON and returns it with checked, checksummed addresses. */
export function parseDeployment(raw: unknown): DeploymentConfig {
  const root = asRecord(raw, "root");

  const tokens: TokenConfig[] = readArray(root, "tokens").map((item, index) => {
    const t = asRecord(item, `tokens[${index}]`);
    return {
      symbol: readString(t, "symbol"),
      name: readString(t, "name"),
      decimals: readInt(t, "decimals"),
      address: readAddress(t, "address"),
    };
  });

  const known = new Set(tokens.map((t) => t.address));
  if (known.size !== tokens.length) {
    throw new Error("Deployment config: duplicate token address");
  }

  const pairs: PairConfig[] = readArray(root, "pairs").map((item, index) => {
    const p = asRecord(item, `pairs[${index}]`);
    const pair: PairConfig = {
      address: readAddress(p, "address"),
      token0: readAddress(p, "token0"),
      token1: readAddress(p, "token1"),
    };
    if (!known.has(pair.token0) || !known.has(pair.token1)) {
      throw new Error(`Deployment config: pairs[${index}] uses an unknown token`);
    }
    return pair;
  });

  return {
    chainId: readInt(root, "chainId"),
    deployBlock: readInt(root, "deployBlock"),
    deployer: readAddress(root, "deployer"),
    factory: readAddress(root, "factory"),
    router: readAddress(root, "router"),
    tokens,
    pairs,
  };
}

const DEPLOYMENTS: Readonly<Record<number, DeploymentConfig>> = {
  31337: parseDeployment(local),
};

/** Returns the deployment for a chain, or undefined if the app has none for it. */
export function getDeployment(chainId: number | undefined): DeploymentConfig | undefined {
  if (chainId === undefined) return undefined;
  return DEPLOYMENTS[chainId];
}
