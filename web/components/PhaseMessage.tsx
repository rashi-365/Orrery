import type { Hex } from "viem";
import { shortAddress } from "@/lib/format";

export type TxPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly label: string }
  | { readonly kind: "done"; readonly message: string; readonly hash?: Hex }
  | { readonly kind: "error"; readonly message: string };

/** Progress, success or error line for a transaction flow. */
export function PhaseMessage({ phase }: { readonly phase: TxPhase }) {
  if (phase.kind === "idle") return null;

  if (phase.kind === "working") {
    return (
      <p aria-live="polite" className="font-mono text-label uppercase text-accent">
        {`// ${phase.label}`}
      </p>
    );
  }
  if (phase.kind === "error") {
    return (
      <p role="alert" className="border border-line-strong px-3 py-2 font-mono text-data text-text">
        <span className="text-muted">ERROR // </span>
        {phase.message}
      </p>
    );
  }
  return (
    <p aria-live="polite" className="border border-line-strong px-3 py-2 font-mono text-data text-text">
      <span className="text-accent">DONE // </span>
      {phase.message}
      {phase.hash !== undefined && <span className="text-muted">{` ${shortAddress(phase.hash)}`}</span>}
    </p>
  );
}
