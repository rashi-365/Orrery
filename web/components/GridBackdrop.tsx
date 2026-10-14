/** Full-screen hairline grid. Drawn as an SVG pattern, so it is flat strokes, not a gradient. */
export function GridBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    >
      <defs>
        <pattern id="backdrop-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 L 0 32"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.035"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#backdrop-grid)" />
    </svg>
  );
}
