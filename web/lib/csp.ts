export type CspOptions = {
  readonly nonce: string;
  readonly isDev: boolean;
  readonly rpcOrigins: readonly string[];
};

const WALLETCONNECT_HTTPS = ["https://*.walletconnect.com", "https://*.walletconnect.org"];
const WALLETCONNECT_SOCKETS = ["wss://*.walletconnect.com", "wss://*.walletconnect.org"];

const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";

/** The Sepolia RPC origin, allowed only when the app is built for Sepolia. */
function sepoliaOrigins(): string[] {
  if (process.env.NEXT_PUBLIC_CHAIN_ID !== "11155111") return [];
  try {
    return [new URL(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? SEPOLIA_RPC_DEFAULT).origin];
  } catch {
    return [new URL(SEPOLIA_RPC_DEFAULT).origin];
  }
}

/**
 * Content-Security-Policy for one response. Scripts need the per-request nonce. Styles allow
 * 'unsafe-inline', the usual compromise with Next.js. Development adds what hot reload needs.
 */
export function buildCsp({ nonce, isDev, rpcOrigins }: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connectSrc = [
    "'self'",
    ...rpcOrigins,
    ...sepoliaOrigins(),
    ...WALLETCONNECT_HTTPS,
    ...WALLETCONNECT_SOCKETS,
  ];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("ws://localhost:*", "ws://127.0.0.1:*");
  }

  const directives: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...WALLETCONNECT_HTTPS]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["frame-src", WALLETCONNECT_HTTPS],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
