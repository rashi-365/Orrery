"use client";

import { useState } from "react";
import { parseSlippagePercent } from "@/lib/amount";
import { cx } from "@/lib/format";
import { HIGH_SLIPPAGE_BPS, SLIPPAGE_PRESETS_BPS } from "@/lib/limits";

type SlippageControlProps = {
  readonly value: number;
  readonly onChange: (bps: number) => void;
};

export function SlippageControl({ value, onChange }: SlippageControlProps) {
  const [custom, setCustom] = useState("");
  const customInvalid = custom !== "" && parseSlippagePercent(custom) === null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-label uppercase text-muted">Slippage</span>
        {SLIPPAGE_PRESETS_BPS.map((preset) => {
          const active = custom === "" && value === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom("");
                onChange(preset);
              }}
              className={cx(
                "border px-2 py-1 font-mono text-label",
                active ? "border-teal text-teal" : "border-line text-muted hover:text-text",
              )}
            >
              {`${preset / 100}%`}
            </button>
          );
        })}
        <label htmlFor="slippage-custom" className="sr-only">
          Custom slippage percentage
        </label>
        <input
          id="slippage-custom"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="CUSTOM %"
          value={custom}
          aria-invalid={customInvalid}
          onChange={(event) => {
            const next = event.target.value;
            if (!/^[\d.]*$/.test(next)) return;
            setCustom(next);
            const bps = parseSlippagePercent(next);
            if (bps !== null) onChange(bps);
          }}
          className={cx(
            "w-24 rounded border bg-transparent px-2 py-1 font-mono text-label uppercase text-text placeholder:text-muted focus:outline-none",
            customInvalid ? "border-line-strong" : "border-line focus:border-teal",
          )}
        />
      </div>
      {customInvalid && (
        <p className="font-mono text-label uppercase text-muted">Use 0.01 to 5 percent</p>
      )}
      {value > HIGH_SLIPPAGE_BPS && (
        <p className="font-mono text-label uppercase text-muted">
          High slippage: you may receive noticeably less
        </p>
      )}
    </div>
  );
}
