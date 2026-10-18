const SUFFIXES = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "K" },
] as const;

/** Dollar amount for dense tables: $1.23M, $456.70K, $12.35, and "<$0.01" for dust. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs < 0.01) return "<$0.01";
  const sign = value < 0 ? "-" : "";
  for (const { limit, suffix } of SUFFIXES) {
    if (abs >= limit) return `${sign}$${(abs / limit).toFixed(2)}${suffix}`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

/** Whole number with thousands separators. */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Signed percentage change with one decimal. Null (no baseline) shows as "--". */
export function formatDeltaPct(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "--";
  if (Math.abs(delta) < 0.05) return "0.0%";
  if (delta > 999) return ">+999%";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

/** Local time of day, HH:MM:SS, from epoch seconds. */
export function formatClock(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 0x plus the first eight hex digits of a hash. */
export function shortHash(hash: string): string {
  return hash.slice(0, 10);
}
