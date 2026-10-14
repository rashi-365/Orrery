import type { Address } from "viem";

type OrbitToken = {
  readonly symbol: string;
  readonly address: Address;
};

type OrbitEdge = {
  readonly token0: Address;
  readonly token1: Address;
};

type Placed = {
  readonly symbol: string;
  readonly x: number;
  readonly y: number;
  readonly cos: number;
  readonly inner: boolean;
};

const CENTER = 200;
const INNER_RADIUS = 105;
const OUTER_RADIUS = 160;
const MAX_INNER = 6;
const TICK_COUNT = 72;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Fixed layout: the first six tokens on the inner ring, the rest on the outer ring. */
function place(tokens: readonly OrbitToken[]): Map<Address, Placed> {
  const innerCount = Math.min(MAX_INNER, tokens.length);
  const outerCount = tokens.length - innerCount;
  const placed = new Map<Address, Placed>();

  tokens.forEach((token, index) => {
    const inner = index < innerCount;
    const slot = inner ? index : index - innerCount;
    const count = inner ? innerCount : outerCount;
    const radius = inner ? INNER_RADIUS : OUTER_RADIUS;
    const offset = inner ? 0 : Math.PI / count;
    const angle = (2 * Math.PI * slot) / count + offset - Math.PI / 2;
    placed.set(token.address, {
      symbol: token.symbol,
      x: round(CENTER + radius * Math.cos(angle)),
      y: round(CENTER + radius * Math.sin(angle)),
      cos: Math.cos(angle),
      inner,
    });
  });
  return placed;
}

const TICKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  const angle = (2 * Math.PI * index) / TICK_COUNT;
  const major = index % 6 === 0;
  const from = 186;
  const to = major ? 197 : 191;
  return {
    key: index,
    major,
    x1: round(CENTER + from * Math.cos(angle)),
    y1: round(CENTER + from * Math.sin(angle)),
    x2: round(CENTER + to * Math.cos(angle)),
    y2: round(CENTER + to * Math.sin(angle)),
  };
});

/** Static orbital drawing of the token network: dots are tokens, lines are pools. */
export function OrbitDiagram({
  tokens,
  edges,
}: {
  readonly tokens: readonly OrbitToken[];
  readonly edges: readonly OrbitEdge[];
}) {
  const placed = place(tokens);
  const nodes = Array.from(placed.entries());

  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label="Token network. Each dot is a token and each line is a pool."
      className="mx-auto h-auto w-full max-w-[560px] text-text"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx={CENTER} cy={CENTER} r="60" strokeOpacity="0.12" strokeDasharray="2 4" />
        <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} strokeOpacity="0.1" />
        <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} strokeOpacity="0.1" />
        <circle cx={CENTER} cy={CENTER} r="186" strokeOpacity="0.22" />
      </g>

      <g stroke="currentColor" strokeWidth="1">
        {TICKS.map((tick) => (
          <line
            key={tick.key}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            strokeOpacity={tick.major ? 0.5 : 0.2}
          />
        ))}
      </g>

      <g stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.75">
        {edges.map((edge) => {
          const a = placed.get(edge.token0);
          const b = placed.get(edge.token1);
          if (a === undefined || b === undefined) return null;
          return <line key={`${edge.token0}-${edge.token1}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </g>

      <g stroke="currentColor" strokeOpacity="0.3" strokeWidth="1">
        <line x1={CENTER - 8} y1={CENTER} x2={CENTER + 8} y2={CENTER} />
        <line x1={CENTER} y1={CENTER - 8} x2={CENTER} y2={CENTER + 8} />
      </g>

      <g fill="currentColor">
        {nodes.map(([address, node]) => (
          <circle key={address} cx={node.x} cy={node.y} r={node.inner ? 3.5 : 3} />
        ))}
      </g>

      <g fill="currentColor" className="font-mono text-muted" fontSize="8">
        {nodes.map(([address, node]) => (
          <text
            key={address}
            x={round(node.x + 9 * node.cos)}
            y={node.y + 3}
            textAnchor={node.cos > 0.2 ? "start" : node.cos < -0.2 ? "end" : "middle"}
          >
            {node.symbol}
          </text>
        ))}
      </g>
    </svg>
  );
}
