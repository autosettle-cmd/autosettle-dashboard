// ─── White-Label Branding Configuration ──────────────────────────────────────
// Change these values to rebrand the entire app.
// This is the ONLY file you need to edit when white-labeling.
// ─────────────────────────────────────────────────────────────────────────────

export const brand = {
  // ── App Identity ──────────────────────────────────────────────────────────
  name: 'Fortura',
  tagline: 'Business Advisory',
  description:
    'AI-powered expense management for Fortura Business Advisory.',
  portalTitle: 'Fortura Portal',

  // ── Assets ────────────────────────────────────────────────────────────────
  logo: '/Fortura logo.svg',
  logoAlt: 'Fortura Business Advisory',

  // ── Brand Colors ──────────────────────────────────────────────────────────
  colors: {
    // Primary action (CTA buttons, active states, links)
    primary: '#234C77',             // Dark navy
    primaryContainer: '#7AAED9',    // Light blue (gradient end)

    // Sidebar / Navigation anchor
    sidebar: '#1A3A5C',             // Navy sidebar

    // Surfaces (tonal layering — no borders, use bg shifts)
    surfaceBase: '#F0F2F5',         // Level 0: page background
    surfaceLow: '#E8ECF0',          // Level 1: sections
    surfaceCard: '#FFFFFF',         // Level 2: cards
    surfaceHeader: '#DDE3E9',       // Table headers, elevated sections

    // Text hierarchy
    textPrimary: '#1E3A5F',         // Main text — navy tint
    textSecondary: '#4A5B6D',       // Labels, metadata
    textMuted: '#7A8A9A',           // Placeholder, disabled

    // Borders (ghost borders only — 15% opacity)
    outline: '#B8C4D0',

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
