// ─── White-Label Branding Configuration ──────────────────────────────────────
// Change these values to rebrand the entire app.
// This is the ONLY file you need to edit when white-labeling.
// ─────────────────────────────────────────────────────────────────────────────

export const brand = {
  // ── App Identity ──────────────────────────────────────────────────────────
  name: 'Autosettle',
  tagline: 'Expense management for Malaysian accounting firms',
  description:
    'AI-powered expense management built for Malaysian accounting firms. Invoices, claims, reconciliation — settled automatically.',
  portalTitle: 'Autosettle Portal',

  // ── Assets ────────────────────────────────────────────────────────────────
  logo: '/logo.png',
  logoAlt: 'Autosettle AI Solutions',

  // ── Brand Colors ──────────────────────────────────────────────────────────
  colors: {
    // Primary action (CTA buttons, active states, links)
    primary: '#003D9B',
    primaryContainer: '#0052CC',    // Gradient end for primary buttons

    // Sidebar / Navigation anchor
    sidebar: '#151C28',

    // Surfaces (tonal layering — no borders, use bg shifts)
    surfaceBase: '#F7F9FB',         // Level 0: page background
    surfaceLow: '#F2F4F6',          // Level 1: sections
    surfaceCard: '#FFFFFF',         // Level 2: cards
    surfaceHeader: '#E6E8EA',       // Table headers, elevated sections

    // Text hierarchy
    textPrimary: '#191C1E',         // Main text — never use #000
    textSecondary: '#434654',       // Labels, metadata
    textMuted: '#8E9196',           // Placeholder, disabled

    // Borders (ghost borders only — 15% opacity)
    outline: '#C3C6D6',

    // Status: Warning / Pending (amber spectrum — use sparingly)
    warningBg: '#805000',
    warningText: '#2A1700',
    warningAccent: '#FFB95F',
    warningMuted: '#603B00',

    // Status: Success
    successBg: '#E8F5E9',
    successText: '#1B5E20',

    // Status: Error
    errorBg: '#FFEBEE',
    errorText: '#B71C1C',
  },

  // ── AI Assistant (WhatsApp) ───────────────────────────────────────────────
  ai: {
    name: 'Lisa',
    greeting: 'Hi! I\'m Lisa, your AI expense assistant.',
  },
} as const;

// ── Derived helpers (do not edit) ───────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/** CSS custom-property map injected into :root by BrandingStyles */
export function getBrandCssVars(): Record<string, string> {
  const c = brand.colors;
  return {
    // Primary
    '--primary': c.primary,
    '--primary-container': c.primaryContainer,
    '--primary-rgb': hexToRgb(c.primary),

    // Legacy aliases (backward compat while migrating pages)
    '--accent': c.primary,
    '--accent-hover': c.primaryContainer,
    '--accent-rgb': hexToRgb(c.primary),
    '--accent-hover-rgb': hexToRgb(c.primaryContainer),

    // Sidebar
    '--sidebar': c.sidebar,
    '--sidebar-rgb': hexToRgb(c.sidebar),
    '--surface-dark': c.sidebar,
    '--surface-dark-rgb': hexToRgb(c.sidebar),

    // Surfaces
    '--surface-base': c.surfaceBase,
    '--surface-low': c.surfaceLow,
    '--surface-card': c.surfaceCard,
    '--surface-header': c.surfaceHeader,

    // Text
    '--text-primary': c.textPrimary,
    '--text-secondary': c.textSecondary,
    '--text-muted': c.textMuted,

    // Outline
    '--outline': c.outline,
    '--outline-ghost': `${c.outline}26`,  // 15% opacity

    // Legacy aliases
    '--surface': c.surfaceCard,
    '--surface-secondary': c.surfaceBase,
    '--border': `${c.outline}33`,         // 20% opacity
    '--border-light': `${c.outline}1A`,   // 10% opacity
  };
}
