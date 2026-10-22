"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
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
    // reducedMotion="user" turns off movement animations for people who ask their system for less.
    <MotionConfig reducedMotion="user">
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <MarketDataProvider>{children}</MarketDataProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </MotionConfig>
  );
}
