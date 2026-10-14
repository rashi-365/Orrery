type LogoProps = {
  readonly size?: number;
  readonly className?: string;
};

// Eight dots on a ring around a centre point, one slightly larger: an orrery in miniature.
const RING = [
  { x: 21, y: 12, r: 1.2 },
  { x: 18.36, y: 18.36, r: 1.2 },
  { x: 12, y: 21, r: 1.2 },
  { x: 5.64, y: 18.36, r: 1.2 },
  { x: 3, y: 12, r: 1.2 },
  { x: 5.64, y: 5.64, r: 1.2 },
  { x: 12, y: 3, r: 1.2 },
  { x: 18.36, y: 5.64, r: 2 },
] as const;

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="2.4" />
      {RING.map((dot) => (
        <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={dot.r} />
      ))}
    </svg>
  );
}
