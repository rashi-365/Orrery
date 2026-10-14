import type { ReactNode } from "react";
import { cx } from "@/lib/format";
import { Corners } from "./Corners";
import { SectionMarker } from "./SectionMarker";

type PanelProps = {
  readonly title?: string;
  readonly index?: string;
  readonly action?: ReactNode;
  readonly flush?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

/** Flat surface with a 1px border, corner brackets and an optional header. */
export function Panel({ title, index, action, flush = false, className, children }: PanelProps) {
  return (
    <section className={cx("relative border border-line bg-surface", className)}>
      <Corners />
      {title !== undefined && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
          <SectionMarker label={title} index={index} />
          {action}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
