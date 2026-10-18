"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/config/wagmi";
import { MarketDataProvider } from "./MarketDataProvider";

export function Providers({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MarketDataProvider>{children}</MarketDataProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
