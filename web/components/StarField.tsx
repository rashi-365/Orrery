import { createRng } from "@/lib/prng";

const WHITE = "#FFFFFF";
const AMBER = "#C8C8C8";
const STAR_COUNT = 190;

type Star = {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly opacity: number;
  readonly amber: boolean;
  readonly twinkle: boolean;
  readonly delay: number;
  readonly duration: number;
};

const SPARKLES = [
  { x: 12, y: 22, arm: 7, amber: false },
  { x: 83, y: 14, arm: 9, amber: true },
  { x: 67, y: 71, arm: 7, amber: false },
  { x: 28, y: 84, arm: 8, amber: false },
  { x: 91, y: 52, arm: 6, amber: true },
  { x: 46, y: 9, arm: 7, amber: false },
  { x: 6, y: 58, arm: 6, amber: false },
] as const;

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Fixed seed: the same sky on every load, with no randomness at render time.
function buildStars(): Star[] {
  const rng = createRng(20261019);
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const bright = rng() < 0.18;
    stars.push({
      x: round(rng() * 100, 2),
      y: round(rng() * 100, 2),
      r: round(bright ? 1 + rng() * 0.5 : 0.5 + rng() * 0.45, 2),
      opacity: round(bright ? 0.55 + rng() * 0.3 : 0.2 + rng() * 0.35, 2),
      amber: rng() < 0.09,
      twinkle: rng() < 0.22,
      delay: round(rng() * 8, 1),
      duration: round(4 + rng() * 6, 1),
    });
  }
  return stars;
}

const STARS = buildStars();

/** Fixed full-screen star field drawn as flat SVG shapes: no images, no gradients. */
export function StarField() {
  return (
    <svg aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full">
      {STARS.map((star, index) => (
        <circle
          key={index}
          cx={`${star.x}%`}
          cy={`${star.y}%`}
          r={star.r}
          fill={star.amber ? AMBER : WHITE}
          fillOpacity={star.opacity}
          className={star.twinkle ? "star-twinkle" : undefined}
          style={
            star.twinkle
              ? { animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }
              : undefined
          }
        />
      ))}
      {SPARKLES.map((sparkle) => {
        const color = sparkle.amber ? AMBER : WHITE;
        return (
          <svg
            key={`${sparkle.x}-${sparkle.y}`}
            x={`${sparkle.x}%`}
            y={`${sparkle.y}%`}
            width="1"
            height="1"
            overflow="visible"
          >
            <g stroke={color} strokeOpacity="0.55" strokeWidth="1">
              <line x1={-sparkle.arm} y1="0" x2={sparkle.arm} y2="0" />
              <line x1="0" y1={-sparkle.arm} x2="0" y2={sparkle.arm} />
            </g>
            <circle cx="0" cy="0" r="1.4" fill={color} fillOpacity="0.9" />
          </svg>
        );
      })}
    </svg>
  );
}
