# Design System: The Precision Ledger

## 1. Overview

An editorial approach to financial data. Information is organized through depth, light, and tonal shift — not borders. Every interactive element has a **punchy 3D** feel with physical press animations. The system uses a single font (Lato), sharp corners throughout, and CSS variables for all colors.

**Key principles:**
- Tonal layering (no 1px borders for sectioning)
- Punchy 3D buttons with press animation on every click
- Sharp corners everywhere (0px border-radius)
- Single font system (Lato)
- All colors via CSS variables from `config/branding.ts` — never hardcode hex in pages

---

## 2. Colors

All colors defined in `config/branding.ts`, injected as CSS variables by `BrandingStyles`. **Never hardcode hex values in page files.**

### Primary: Steel Blue (`var(--primary)` / #234B6E)
Used for: CTAs (`btn-thick-navy`), sidebar background, modal headers, active states, links.
Darker shade: `var(--primary-container)` / #1A3D5C — used for 3D button bottom/right borders.

### Surface Hierarchy (Tonal Layering)
| Layer | Variable | Value | Usage |
|-------|----------|-------|-------|
| Base | `var(--surface-base)` | #F7F9FB | Page canvas, `paper-texture` class |
| Low | `var(--surface-low)` | #F2F4F6 | Secondary sections, alternating table rows, modal footers |
| Card | `var(--surface-card)` | #FFFFFF | Cards, elevated modules (`card-popped`) |
| Header | `var(--surface-header)` | #E6E8EA | Table headers, hover states |
| Highest | `var(--surface-highest)` | #E0E3E5 | Maximum emphasis |

### Text Hierarchy
| Variable | Value | Usage |
|----------|-------|-------|
| `var(--text-primary)` | #191C1E | Main text (never use pure black) |
| `var(--text-secondary)` | #444650 | Labels, metadata, secondary text |
| `var(--text-muted)` | #7A8A9A | Placeholder, disabled |

### Semantic Colors
| Variable | Value | Usage |
|----------|-------|-------|
| `var(--match-green)` | #0A9981 | Approve, success, credit amounts |
| `var(--match-green-dark)` | #066656 | Green button 3D borders |
| `var(--reject-red)` | #F23545 | Reject, error, debit amounts, notification badges |
| `var(--reject-red-dark)` | #A81C28 | Red button 3D borders |
| `var(--outline)` | #C5C6D2 | Ghost borders (use at 15% opacity via `var(--outline-ghost)`) |

---

## 3. Typography

**Single-font system: Lato only.**

Lato is the only typeface across the entire app — body, headings, numbers, labels, buttons. Chosen for its crisp bold weight on light backgrounds and Calibri-like feel ideal for accounting software.

| Context | Style |
|---------|-------|
| Page titles | `text-xl font-bold tracking-tighter` |
| Display numbers (stat cards) | `text-2xl font-extrabold tabular-nums` |
| Table data numbers | `tabular-nums` (Lato with font-variant-numeric alignment) |
| Labels / metadata | `text-[10px] font-bold uppercase tracking-widest` or `text-[11px] font-semibold uppercase tracking-wide` |
| Date subtitles | `text-[10px] uppercase tracking-widest` |
| Body text | `text-sm` (14px) or `text-body-md` (0.875rem) |
| Date format | Dot notation: `YYYY.MM.DD` (e.g. 2026.04.17) |

---

## 4. Elevation & Depth

### Card-Popped Effect
Cards use directional borders for physical depth:
- Top/left: `1px solid rgba(255,255,255,0.8)` (light catch)
- Bottom: `2px solid rgba(0,0,0,0.08)` (shadow)
- Right: `2px solid rgba(0,0,0,0.08)`
- Box-shadow: `2px 2px 4px rgba(0,0,0,0.03)`

### Thick Button System (Signature Element)
All buttons have a **punchy 3D press** effect:
- Bottom border: 5px solid (darker shade)
- Right border: 2px solid (darker shade)
- Top/left: 1px solid (white at low opacity)
- **Hover:** `btn-jiggle` micro-wobble (±0.5px translateX, ±0.2deg rotate, 0.3s)
- **Active/Click:** borders collapse + `translateY(4px)` press. Animation cancelled.

### Ambient Shadows
Floating elements (modals, dropdowns): `0px 24px 48px rgba(26, 50, 87, 0.08)` — tinted navy.

---

## 5. Components

### Buttons
| Class | Background | Borders | Text | Usage |
|-------|-----------|---------|------|-------|
| `btn-thick-navy` | `var(--primary)` | `var(--primary-container)` | White | Primary CTA |
| `btn-thick-white` | #FFFFFF | #D1D5DB | Dark | Secondary actions |
| `btn-thick-green` | `var(--match-green)` | `var(--match-green-dark)` | White | Approve, confirm |
| `btn-thick-red` | `var(--reject-red)` | `var(--reject-red-dark)` | White | Reject, delete |
| `btn-thick-sidebar` | #2E6999 | #1F5280 | White | Sidebar nav items |

All buttons: sharp corners, `active:translateY(4px)`, `btn-jiggle` on hover.

### Form Inputs (`input-field`)
Same punchy 3D treatment as buttons:
- Bottom: 3px solid #d1d5db, Right: 2px solid #d1d5db
- Top/left: 1px solid #f3f4f6
- **Hover:** shadow lift
- **Focus:** bottom/right borders change to `var(--primary)`
- Sharp corners, no border-radius

### Tables
- **Headers:** `bg-[var(--surface-header)]`, Lato bold uppercase `tracking-widest`
- **Rows:** Alternating white / `bg-[var(--surface-low)]` — no divider lines
- **Hover:** `bg-[var(--surface-header)]`
- **Density:** 40-48px rows
- **Numbers:** right-aligned, `tabular-nums`

### Stat Cards
- `card-popped` for 3D effect
- Clickable: `hover:shadow` + `active:translate-y-[2px]`
- **Labels:** Lato 11px semibold uppercase
- **Values:** Lato extrabold `text-2xl tabular-nums`
- **Icons:** card-popped with color-coded bg (gray/amber/green)

### Badges / Chips
- Sharp corners with `inset-shadow` (engraved feel)
- 10px bold uppercase
- Colors: error-container/on-error-container, secondary-container/on-secondary-container
- **Notification badges (sidebar):** `var(--reject-red)`, `rounded-full`, centered with flex

### Modals
- **Centered** always
- **Scrim:** #070E1B at 40% opacity, 2px backdrop-blur
- **Header:** `bg-[var(--primary)]`, white text, bold uppercase tracking
- **Footer:** `bg-[var(--surface-low)]`
- Sharp corners throughout

### Sidebar
- **Width:** `w-52` (208px)
- **Background:** solid `var(--primary)` (#234B6E)
- **Logo header:** same bg, `border-b border-white/10`, `h-16` (matches main header)
- **Shadow bleed:** layered box-shadow fades into main content
- **Nav buttons:** `btn-thick-sidebar` (lighter blue #2E6999)
- **Active page:** white button with `var(--primary)` colored text
- **Notification badges:** red pill (`var(--reject-red)`, `rounded-full`)
- **Bottom section:** firm selector (darkest `#1A3D5C`), user info (`white/10` bg), sign out (text only)
- **Firm selector:** `btn-thick-sidebar` with darkest shade — visually distinct from nav

---

## 6. Page Layout

### Structure
```
<div class="flex h-screen overflow-hidden">
  <Sidebar role="..." />
  <div class="flex-1 flex flex-col overflow-hidden ledger-binding">
    <header class="h-16 bg-white border-b border-[#E0E3E5] pl-14 pr-6">
      <!-- Title + date subtitle -->
    </header>
    <main class="flex-1 overflow-y-auto p-8 pl-14 paper-texture">
      <!-- Content -->
    </main>
  </div>
</div>
```

### Signature Effects
- **Paper texture:** subtle dot-grid on main content (`paper-texture` class)
- **Ledger binding:** left-edge book-spine gradient shadow (`ledger-binding` class)
- **Inset shadow:** engraved feel on badges (`inset-shadow` class)

---

## 7. Do's and Don'ts

### Do
- Use CSS variables for ALL colors — never hardcode hex in page files
- Use white space as a separator — increase padding, don't add lines
- Use `tabular-nums` on all financial data for column alignment
- Use the punchy 3D button system for ALL interactive elements
- Use sharp corners (0px radius) on everything except notification badges
- Use `paper-texture` + `ledger-binding` on main content areas
- Use `card-popped` on cards and stat card icons
- Use `btn-thick-sidebar` for nav; active = white button with `var(--primary)` text
- Use `input-field` class for all form inputs — they have the same punchy 3D treatment

### Don't
- Use 1px borders to separate cards or table rows
- Use pure black (#000000) — always `var(--text-primary)` (#191C1E)
- Use standard drop shadows — use card-popped directional borders
- Use rounded corners on buttons, cards, modals, inputs, or badges
- Use any font other than Lato — single font system, no exceptions
- Use gradient fills on buttons — flat color + 3D borders only
- Make active sidebar button same color as inactive — use white to distinguish
- Hardcode hex colors in page files — all colors from CSS variables
