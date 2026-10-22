import type { ReactNode } from "react";
import { cx } from "@/lib/format";

type StatProps = {
  readonly label: string;
  /** Null renders as a dash, for values that are not available yet. */
  readonly value: ReactNode;
  readonly unit?: string;
  readonly align?: "left" | "right";
};

export function Stat({ label, value, unit, align = "left" }: StatProps) {
  return (
    <div className={cx("flex flex-col gap-1", align === "right" && "items-end")}>
      <span className="font-mono text-label uppercase text-muted">{label}</span>
      <span className="font-mono text-stat tabular-nums text-text">
        {value ?? "--"}
        {unit !== undefined && <span className="ml-1 text-data text-muted">{unit}</span>}
      </span>
    </div>
  );
}
