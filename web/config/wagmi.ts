import { foundry, sepolia } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { LOCAL_RPC_URL, SEPOLIA_RPC_URL } from "./rpc";

// Explicit connectors only. WalletConnect is offered when a (public) project id is configured.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors =
  projectId !== undefined && projectId !== ""
    ? [injected(), walletConnect({ projectId })]
    : [injected()];

export const wagmiConfig = createConfig({
  chains: [foundry, sepolia],
  connectors,
  transports: {
    [foundry.id]: http(LOCAL_RPC_URL, { batch: true }),
    [sepolia.id]: http(SEPOLIA_RPC_URL, { batch: true }),
  },
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
