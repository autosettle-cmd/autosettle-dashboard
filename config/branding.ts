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
    accent: '#A60201',       // Primary brand color (buttons, links, active states)
    accentHover: '#8B0101',  // Darker accent for hover states
    sidebar: '#152237',      // Sidebar background
    surface: '#1a2d47',      // Secondary dark surface (gradients, dark buttons)
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
  const { accent, accentHover, sidebar, surface } = brand.colors;
  return {
    '--accent': accent,
    '--accent-hover': accentHover,
    '--accent-rgb': hexToRgb(accent),
    '--accent-hover-rgb': hexToRgb(accentHover),
    '--sidebar': sidebar,
    '--sidebar-rgb': hexToRgb(sidebar),
    '--surface-dark': surface,
    '--surface-dark-rgb': hexToRgb(surface),
  };
}
