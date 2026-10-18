"use client";

import { formatUsd } from "@/lib/display";
import { useTotalTvl } from "@/lib/useMarketStats";
import { Stat } from "./Stat";

export function TotalTvl() {
  const tvl = useTotalTvl();
  return <Stat label="Total TVL" value={tvl === undefined ? null : formatUsd(tvl)} align="right" />;
}
