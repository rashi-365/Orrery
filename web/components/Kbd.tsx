import type { ReactNode } from "react";

/** Keyboard hint chip. */
export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="border border-line-strong px-1.5 font-mono text-label text-muted">
      {children}
    </kbd>
  );
}
