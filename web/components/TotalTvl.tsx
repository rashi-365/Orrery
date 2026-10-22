"use client";

import { formatUsd } from "@/lib/display";
import { useTotalTvl } from "@/lib/useMarketStats";
import { AnimatedNumber } from "./AnimatedNumber";
import { Stat } from "./Stat";

export function TotalTvl() {
  const tvl = useTotalTvl();
  return (
    <Stat
      label="Total TVL"
      value={tvl === undefined ? null : <AnimatedNumber value={tvl} format={formatUsd} minChars={8} />}
      align="right"
    />
  );
}
