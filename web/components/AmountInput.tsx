type AmountInputProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange?: (value: string) => void;
  readonly readOnly?: boolean;
  readonly invalid?: boolean;
};

/** Decimal amount field. Typing is filtered so only digits and one dot get through. */
export function AmountInput({ id, label, value, onChange, readOnly = false, invalid = false }: AmountInputProps) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="0.0"
        value={value}
        readOnly={readOnly}
        aria-invalid={invalid}
        onChange={(event) => {
          if (readOnly || onChange === undefined) return;
          const next = event.target.value;
          if (/^\d*\.?\d*$/.test(next)) onChange(next);
        }}
        className={`w-full rounded border bg-transparent px-3 py-2 text-right font-mono text-stat tabular-nums text-text placeholder:text-muted focus:outline-none ${
          invalid ? "border-line-strong" : "border-line focus:border-accent"
        }`}
      />
    </div>
  );
}
