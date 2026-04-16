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
  sidebarLogo: '/Fortura logo icon.svg',
  logoAlt: 'Fortura Business Advisory',

  // ── Brand Colors (The Precision Ledger) ───────────────────────────────────
  colors: {
    // Primary action (CTA buttons, headings, sidebar accent)
    primary: '#234B6E',
    primaryContainer: '#1A3D5C',    // Slightly darker blue for gradients/borders

    // Sidebar / Navigation anchor
    sidebar: '#F7F9FB',             // Light sidebar with thick navy border

    // Surfaces (tonal layering — archival paper stacking)
    surfaceBase: '#F7F9FB',         // Level 0: page canvas
    surfaceLow: '#F2F4F6',          // Level 1: secondary sections
    surfaceCard: '#FFFFFF',         // Level 2: cards, elevated modules
    surfaceHeader: '#E6E8EA',       // Table headers, emphasis layers
    surfaceHighest: '#E0E3E5',      // Highest emphasis

    // Text hierarchy (deep navy tones — never pure black)
    textPrimary: '#191C1E',         // Main text (on-surface)
    textSecondary: '#444650',       // Labels, metadata (on-surface-variant)
    textMuted: '#7A8A9A',           // Placeholder, disabled

    // Borders (ghost borders only — 15% opacity)
    outline: '#C5C6D2',

    // Status: Match / Approve (green)
    matchGreen: '#0A9981',
    matchGreenDark: '#066656',

    // Status: Reject / Error (red)
    rejectRed: '#F23545',
    rejectRedDark: '#A81C28',

    // Status: Warning / Pending (amber spectrum)
    warningBg: '#805000',
    warningText: '#2A1700',
    warningAccent: '#FFB95F',
    warningMuted: '#603B00',

    // Status badges
    errorContainer: '#FFDAD6',
    onErrorContainer: '#93000A',
    secondaryContainer: '#D6E0F1',
    onSecondaryContainer: '#596372',

    // Status: Success (legacy compat)
    successBg: '#E8F5E9',
    successText: '#1B5E20',

    // Status: Error (legacy compat)
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
    '--surface-dark': c.primary,          // Modal headers use primary
    '--surface-dark-rgb': hexToRgb(c.primary),

    // Surfaces
    '--surface-base': c.surfaceBase,
    '--surface-low': c.surfaceLow,
    '--surface-card': c.surfaceCard,
    '--surface-header': c.surfaceHeader,
    '--surface-highest': c.surfaceHighest,

    // Text
    '--text-primary': c.textPrimary,
    '--text-secondary': c.textSecondary,
    '--text-muted': c.textMuted,

    // Outline
    '--outline': c.outline,
    '--outline-ghost': `${c.outline}26`,  // 15% opacity

    // Semantic colors
    '--match-green': c.matchGreen,
    '--match-green-dark': c.matchGreenDark,
    '--reject-red': c.rejectRed,
    '--reject-red-dark': c.rejectRedDark,

    // Legacy aliases
    '--surface': c.surfaceCard,
    '--surface-secondary': c.surfaceBase,
    '--border': `${c.outline}33`,         // 20% opacity
    '--border-light': `${c.outline}1A`,   // 10% opacity
  };
}
