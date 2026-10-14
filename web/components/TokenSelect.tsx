import type { Address } from "viem";
import type { TokenConfig } from "@/config/deployment";

type TokenSelectProps = {
  readonly id: string;
  readonly label: string;
  readonly tokens: readonly TokenConfig[];
  readonly value: Address;
  readonly onChange: (address: Address) => void;
};

export function TokenSelect({ id, label, tokens, value, onChange }: TokenSelectProps) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const match = tokens.find((token) => token.address === event.target.value);
          if (match !== undefined) onChange(match.address);
        }}
        className="w-full appearance-none rounded border border-line bg-bg py-2 pl-3 pr-8 font-sans text-sm font-semibold uppercase tracking-label text-text focus:border-teal focus:outline-none"
      >
        {tokens.map((token) => (
          <option key={token.address} value={token.address} className="bg-bg text-text">
            {token.symbol}
          </option>
        ))}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      >
        <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  );
}
