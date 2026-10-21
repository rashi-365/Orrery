"use client";

import { useEffect, useState } from "react";
import { SLOW_FRAME_MS, type FrameMeter, type FrameSummary } from "@/lib/frameStats";
import type { SpritePool } from "@/lib/particles";

const REFRESH_MS = 500;

type PerfOverlayProps = {
  readonly meter: FrameMeter;
  readonly particles: SpritePool;
  readonly rings: SpritePool;
  readonly stress: boolean;
  readonly onToggleStress: () => void;
};

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

function ms(value: number): string {
  return `${value.toFixed(1)} ms`;
}

/** Frame timing readout and a stress switch. Shown only when the address ends in ?perf. */
export function PerfOverlay({ meter, particles, rings, stress, onToggleStress }: PerfOverlayProps) {
  const [summary, setSummary] = useState<FrameSummary | null>(null);
  const [live, setLive] = useState({ particles: 0, rings: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      setSummary(meter.summary());
      setLive({ particles: particles.visibleCount(now), rings: rings.visibleCount(now) });
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [meter, particles, rings]);

  const verdict = summary === null ? "--" : summary.p95Ms <= SLOW_FRAME_MS ? "OK" : "SLOW";
  const buttonClass =
    "border border-line-strong px-2 py-1 text-text hover:border-accent hover:text-accent";

  return (
    <div className="absolute left-1/2 top-3 z-20 w-72 -translate-x-1/2 border border-line-strong bg-bg p-3 font-mono text-label uppercase text-muted">
      <p className="text-text">Performance</p>
      <dl className="mt-2 space-y-1">
        <Row label="FPS" value={summary === null ? "--" : summary.fps.toFixed(1)} />
        <Row label="Frame average" value={summary === null ? "--" : ms(summary.avgMs)} />
        <Row label="Frame 95th pct" value={summary === null ? "--" : ms(summary.p95Ms)} />
        <Row label="Frame worst" value={summary === null ? "--" : ms(summary.worstMs)} />
        <Row
          label={`Over ${SLOW_FRAME_MS} ms`}
          value={summary === null ? "--" : `${summary.slowFrames} / ${summary.frames}`}
        />
        <Row label="Particles / rings" value={`${live.particles} / ${live.rings}`} />
        <Row label="Verdict" value={verdict} />
      </dl>
      <div className="mt-3 flex gap-2">
        <button type="button" aria-pressed={stress} onClick={onToggleStress} className={buttonClass}>
          {stress ? "Stress 300: on" : "Stress 300: off"}
        </button>
        <button type="button" onClick={() => meter.reset()} className={buttonClass}>
          Reset
        </button>
      </div>
    </div>
  );
}
