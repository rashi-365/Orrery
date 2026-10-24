import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // The design system forbids gradients, shadows and blur, so the utilities do not exist.
  corePlugins: {
    backgroundImage: false,
    gradientColorStops: false,
    boxShadow: false,
    boxShadowColor: false,
    dropShadow: false,
    blur: false,
    backdropBlur: false,
    backdropFilter: false,
  },
  theme: {
    borderRadius: { none: "0px", sm: "2px", DEFAULT: "4px" },
    colors: {
      transparent: "transparent",
      current: "currentColor",
      // Pure black with neutral greys: no blue, no violet, anywhere.
      bg: "#000000",
      surface: "#060606",
      line: "rgba(255, 255, 255, 0.10)",
      "line-strong": "rgba(255, 255, 255, 0.22)",
      text: "#E4E4E4",
      muted: "#8C8C8C",
      // White is the interface accent and the colour of net buying. Amber is net selling.
      accent: "#FFFFFF",
      amber: "#F2A33A",
      // Deltas. Used only for numbers.
      up: "#5BD16B",
      down: "#F0524F",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-grotesk)", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.14em" }],
        data: ["0.75rem", { lineHeight: "1rem" }],
        stat: ["1.5rem", { lineHeight: "2rem" }],
        title: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "0.12em" }],
      },
      letterSpacing: {
        label: "0.14em",
        wordmark: "0.32em",
      },
    },
  },
  plugins: [],
};

export default config;
