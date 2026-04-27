import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      mobile: { max: "767px" },
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-lato)", "Lato", "var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-lato)", "Lato", "var(--font-inter)", "Inter", "monospace"],
        label: ["var(--font-lato)", "Lato", "var(--font-inter)", "Inter", "sans-serif"],
      },

      // ── Design System Colors (The Precision Ledger) ────────────────────
      colors: {
        primary: {
          DEFAULT: "var(--primary)",
          container: "var(--primary-container)",
        },
        surface: {
          base: "var(--surface-base)",
          low: "var(--surface-low)",
          card: "var(--surface-card)",
          header: "var(--surface-header)",
          highest: "var(--surface-highest)",
        },
        ds: {
          text: "var(--text-primary)",
          "text-secondary": "var(--text-secondary)",
          "text-muted": "var(--text-muted)",
          outline: "var(--outline)",
          "outline-ghost": "var(--outline-ghost)",
          sidebar: "var(--sidebar)",
        },
        "match-green": "var(--match-green)",
        "reject-red": "var(--reject-red)",
        // Legacy aliases
        background: "var(--background)",
        foreground: "var(--foreground)",
      },

      // ── Typography Scale (Editorial Financial Intelligence) ─────────────
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.1", fontWeight: "600" }],
        "display-md": ["2.75rem", { lineHeight: "1.15", fontWeight: "600" }],
        "display-sm": ["2rem", { lineHeight: "1.2", fontWeight: "600" }],
        "headline-lg": ["2rem", { lineHeight: "1.3", fontWeight: "500" }],
        "headline-md": ["1.75rem", { lineHeight: "1.3", fontWeight: "500" }],
        "headline-sm": ["1.5rem", { lineHeight: "1.35", fontWeight: "500" }],
        "title-lg": ["1.25rem", { lineHeight: "1.4", fontWeight: "600" }],
        "title-md": ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        "title-sm": ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-md": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
        "label-lg": ["0.875rem", { lineHeight: "1.4", fontWeight: "700", letterSpacing: "0.02em" }],
        "label-md": ["0.75rem", { lineHeight: "1.4", fontWeight: "700", letterSpacing: "0.04em" }],
        "label-sm": ["0.6875rem", { lineHeight: "1.3", fontWeight: "700", letterSpacing: "0.05em" }],
      },

      // ── Border Radius (sharp corners — The Precision Ledger) ───────────
      borderRadius: {
        "ds-none": "0px",
        "ds-sm": "0px",        // Sharp corners
        "ds-md": "0px",        // Sharp corners
        "ds-lg": "0px",        // Sharp corners
        "ds-full": "9999px",   // Status chips only
      },

      // ── Shadows (ambient + punchy 3D) ─────────────────────────────────
      boxShadow: {
        "ds-ambient": "0px 24px 48px rgba(26, 50, 87, 0.08)",  // Modals, dropdowns (tinted navy)
        "ds-subtle": "0 1px 8px rgba(25, 28, 30, 0.04)",       // Slight lift
        "ds-none": "none",
        "card-popped": "2px 2px 4px rgba(0,0,0,0.03)",         // Directional card lift
        "inset": "inset 1px 1px 3px rgba(0,0,0,0.05)",         // Engraved badges
      },
    },
  },
  plugins: [],
};
export default config;
