import type { ReactNode } from "react";
import { cx } from "@/lib/format";
import { SectionMarker } from "./SectionMarker";

type PanelProps = {
  readonly title?: string;
  readonly index?: string;
  readonly action?: ReactNode;
  readonly flush?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

/** Glass surface with a soft border, a faint top glow line and an optional header. */
export function Panel({ title, index, action, flush = false, className, children }: PanelProps) {
  return (
    <section
      className={cx(
        "relative rounded-2xl border border-white/10 bg-black/40 shadow-[0_0_40px_rgba(255,255,255,0.03)] backdrop-blur-md",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
      {title !== undefined && (
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-2">
          <SectionMarker label={title} index={index} />
          {action}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
