type SectionMarkerProps = {
  readonly label: string;
  readonly index?: string;
};

/** Small uppercase mono section heading: a square, an optional // index, then the label. */
export function SectionMarker({ label, index }: SectionMarkerProps) {
  return (
    <div className="flex items-center gap-2 font-mono text-label uppercase text-muted">
      <span aria-hidden="true" className="h-1.5 w-1.5 bg-teal" />
      {index !== undefined && <span aria-hidden="true">{`// ${index}`}</span>}
      <span className="text-text">{label}</span>
    </div>
  );
}
