"use client";

import { useEffect, useRef, useState } from "react";
import { interpolate } from "@/lib/ticker";

type AnimatedNumberProps = {
  readonly value: number;
  readonly format: (value: number) => string;
  readonly durationMs?: number;
  /** Reserve at least this many characters of width, so changing digits never shift the layout. */
  readonly minChars?: number;
};

const DEFAULT_DURATION_MS = 500;

/** A number that counts up or down to its new value instead of jumping. */
export function AnimatedNumber({
  value,
  format,
  durationMs = DEFAULT_DURATION_MS,
  minChars,
}: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(value);
  const displayedRef = useRef(value);

  useEffect(() => {
    const from = displayedRef.current;
    if (from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const next = progress >= 1 ? value : interpolate(from, value, progress);
      displayedRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span
      className="inline-block text-right tabular-nums"
      style={minChars === undefined ? undefined : { minWidth: `${minChars}ch` }}
    >
      {format(displayed)}
    </span>
  );
}
