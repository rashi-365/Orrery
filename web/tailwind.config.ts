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
      bg: "#04070A",
      surface: "#0A0F14",
      line: "rgba(255, 255, 255, 0.08)",
      "line-strong": "rgba(255, 255, 255, 0.16)",
      text: "#E6EAEE",
      muted: "#7B8794",
      // Accent pair: teal is net receives, amber is net sends.
      teal: "#3CC8E8",
      amber: "#F2A33A",
      // Deltas. Used only for numbers.
      up: "#3FCF8E",
      down: "#F0524F",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-archivo)", "Arial", "sans-serif"],
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
