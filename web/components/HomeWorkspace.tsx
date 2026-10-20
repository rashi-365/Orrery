"use client";

import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import type { Metric, WindowKey } from "@/lib/stats";
import { FeedStatus, LiveFeed } from "./LiveFeed";
import { NetworkMap } from "./NetworkMap";
import { Panel } from "./Panel";
import { RankedPanel } from "./RankedPanel";

/**
 * The home screen: the live map and feed on the left, the ranked list on the right. The map
 * and the list share one time window and one selected token. Anything passed as children
 * is shown under the ranked list.
 */
export function HomeWorkspace({ children }: { readonly children: ReactNode }) {
  const [metric, setMetric] = useState<Metric>("volume");
  const [windowKey, setWindowKey] = useState<WindowKey>("1h");
  const [selected, setSelected] = useState<Address | undefined>(undefined);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Panel
          index="01"
          title="Token network"
          flush
          action={
            <span className="font-mono text-label uppercase text-muted">{`Net pressure ${windowKey}`}</span>
          }
        >
          <NetworkMap windowKey={windowKey} selected={selected} onSelect={setSelected} />
        </Panel>
        <Panel index="02" title="Live feed" action={<FeedStatus />} flush>
          <LiveFeed />
        </Panel>
      </div>

      <div className="space-y-6">
        <RankedPanel
          metric={metric}
          onMetricChange={setMetric}
          windowKey={windowKey}
          onWindowChange={setWindowKey}
          selected={selected}
          onSelect={setSelected}
        />
        {children}
      </div>
    </div>
  );
}
