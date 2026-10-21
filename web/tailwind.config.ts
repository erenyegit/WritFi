import type { Config } from "tailwindcss";

/**
 * Printed desk. White paper, navy-black ink and the logo's cobalt, used flat:
 * the interface stays quiet so the numbers carry the weight. Cobalt is a fill
 * (the main button, the pass, the invite stub) and the colour of fine-line
 * work, never a glow or a gradient.
 *
 * The scale names come from the earlier paper theme and stay put so every
 * component keeps its meaning: `paper` is a surface, `ink` is text.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every colour is a CSS variable (globals.css), so one attribute on <html>
      // switches the whole site between themes.
      colors: {
        paper: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)", // page
          sheet: "rgb(var(--paper-sheet) / <alpha-value>)", // panels
          sunk: "rgb(var(--paper-sunk) / <alpha-value>)", // insets, table heads, fields
          tint: "rgb(var(--paper-tint) / <alpha-value>)", // hover
          line: "rgb(var(--paper-line) / <alpha-value>)", // hairlines
          rule: "rgb(var(--paper-rule) / <alpha-value>)", // stronger rules, quiet button borders
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)", // small marks: focus, dots
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-50) / <alpha-value>)",
          200: "rgb(var(--brand-50) / <alpha-value>)",
          300: "#AFBDFF", // labels on the blue pass card, the same in every theme
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)", // the main button
          on: "rgb(var(--on-brand) / <alpha-value>)", // text on the main button
        },
        // The one large block of colour on a page (the invite panel).
        feature: {
          DEFAULT: "rgb(var(--feature) / <alpha-value>)",
          on: "rgb(var(--on-feature) / <alpha-value>)",
          muted: "rgb(var(--on-feature-muted) / <alpha-value>)",
        },
        good: "rgb(var(--good) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        bad: "rgb(var(--bad) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        sheet: "10px",
      },
      maxWidth: {
        page: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
