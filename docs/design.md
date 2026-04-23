# Design System: The Precision Ledger

## 1. Overview

An editorial approach to financial data. Information is organized through depth, light, and tonal shift — not borders. Every interactive element has a **punchy 3D** feel with physical press animations. The system uses a single font (Lato), sharp corners throughout, and CSS variables for all colors.

**Key principles:**
- Tonal layering (no 1px borders for sectioning)
- Punchy 3D buttons that press IN on click (no translateY — stays in place)
- Sharp corners everywhere (0px border-radius)
- Single font system (Lato)
- All colors via CSS variables from `config/branding.ts` — never hardcode hex in pages

**Physical UI hierarchy — every element has a physical role:**
| Element | Physical metaphor | Key treatment |
|---------|------------------|---------------|
| Sidebar | Raised slab sitting ON the page | Casts shadow right, leading edge highlight |
| Main content | Milled well carved below sidebar/header | Inset shadows on left + top edges |
| Action buttons | Keycap keys | Pop out with side walls, press IN on click |
| Filter controls | Keycap controls (`input-field`) | Same as buttons — pops out |
| Edit form fields | Recessed slots (`input-recessed`) | Sinks into surface — paper-feel interior |
| GL dropdown | Navy keycap button | Press-in search state, portal dropdown |
| Status badges | Polished acrylic blocks fused to surface | Specular highlights, no travel shadow |
| Notification badges | Jewel hemispheres | Radial gradient, internal glow, drilled socket |
| Table | Machine chassis | Metal faceplate header, slab rows, chassis frame |
| Sidebar nav items | Molded tiles on slab | Bevel seams, backlit active state |
| Checkboxes | Recessed toggle switches | LED glow dot when checked |

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

### Physical Keycap Button System (Signature Element)
All interactive elements are styled as **physical keycaps** — square frustum shapes with visible side walls, gradient faces, embossed text, and matte texture. They sit inside **keywell** containers (recessed slots) for a hardware-like feel.

**Keycap anatomy (default state):**
- **Face:** `background: linear-gradient(180deg, lighter 0%, base 100%)` — lit from above
- **Top highlight:** `border-top: 1px solid rgba(255,255,255,0.25)` — light catching top edge
- **Side walls:** 4 separate box-shadows creating visible 3D block:
  - Bottom wall: `0 4px 0 0 <darkest>` (thickest, heaviest shadow)
  - Right wall: `2px 0 0 0 <dark>`
  - Corner: `2px 4px 0 0 <darkest>`
  - Left wall: `-1px 0 0 0 <mid>` (lighter — catches more light)
- **Frustum bevel:** `inset 1px 1px 0 0 rgba(255,255,255,0.15)` + `inset -1px -1px 0 0 rgba(0,0,0,0.2)` — tapered edge illusion
- **Embossed text:** `text-shadow: 0 1px 1px rgba(0,0,0,0.3)` — text pressed into surface
- **Matte texture:** `btn-texture` class adds `::after` pseudo-element with noise SVG overlay (3-6% opacity)
- Sharp corners, no border-radius

**Active/Click state (key presses IN, stays in place):**
- Gradient reverses (darker on top — light blocked by keywell rim)
- Top highlight disappears (`border-top-color: transparent`)
- All side walls disappear: `box-shadow: inset 0 2px 4px rgba(0,0,0,0.3)` — pressed-in shadow only
- Text shadow removed (flat when pressed)
- **No `translateY`** — button stays in place and presses into the surface, not floating down

**Hover:** no animation — clean and professional

### Keywell Container
Action button areas use `keywell-rimmed` class — a recessed slot that buttons sit inside:
- **Background:** `linear-gradient(180deg, #D8DBDF 0%, #E4E6E8 4px, #EDEEF0 100%)` — darker at top (shadow from rim)
- **Inset shadow:** `inset 0 3px 6px rgba(0,0,0,0.12)` + `inset 0 1px 2px rgba(0,0,0,0.08)` — depth
- **Bottom lip:** `inset 0 -1px 0 rgba(255,255,255,0.9)` — light catching bottom edge of well
- **Rim border:** `border: 1px solid rgba(0,0,0,0.08)`, top darker, bottom lighter

### Physical UI Utilities
| Class | Effect | Usage |
|-------|--------|-------|
| `btn-texture` | Matte noise overlay via `::after` pseudo | All buttons and inputs |
| `label-stamped` | Debossed text (`text-shadow` light below, dark above) | Field labels, section headers |
| `led-green` / `led-red` / `led-amber` / `led-off` | 6px glowing dot with radial gradient | Status indicators next to badges |
| `keywell` | Recessed container (no rim) | Generic button wells |
| `keywell-rimmed` | Recessed container with raised border rim | Invoice GL section, action button footer |

### Ambient Shadows
Floating elements (modals, dropdowns): `0px 24px 48px rgba(26, 50, 87, 0.08)` — tinted navy.

---

## 5. Components

### Buttons
| Class | Face Gradient | Side Wall Color | Text | Usage |
|-------|-------------|----------------|------|-------|
| `btn-thick-navy` | #2D5F8A → #234B6E | #1A3D5C / #142F47 | White, embossed | Primary CTA, Mark as Reviewed |
| `btn-thick-white` | #FFFFFF → #EDEFF1 | #d1d5db / #b8bcc2 | Dark, debossed | Secondary actions, Edit, Close |
| `btn-thick-green` | #0DB897 → #0A9981 | #066656 / #044D3F | White, embossed | Approve, confirm, Pay |
| `btn-thick-red` | #F75565 → #F23545 | #A81C28 / #8A1620 | White, embossed | Reject, Delete |
| `btn-thick-sidebar` | #3272A0 → #2A6088 → #234B6E | (inset) | White, stamped | Sidebar nav tiles |

All buttons: keycap style, press IN on click (no translateY), no hover animation.

**Nested button isolation:** All `btn-thick-*` `:active` selectors use `:not(:has(:active))` so clicking a child button inside a parent button doesn't trigger the parent's pressed state. This is a global CSS rule — never add inline `onMouseDown` stopPropagation for this purpose.

#### Approve Button (`btn-thick-green`) — Exact CSS
```css
background: linear-gradient(180deg, #0DB897 0%, #0A9981 100%);
border: none;
border-top: 1px solid rgba(255,255,255,0.25);
box-shadow:
  0 4px 0 0 #044D3F,        /* bottom wall (darkest) */
  2px 0 0 0 #066656,        /* right wall */
  2px 4px 0 0 #044D3F,      /* corner */
 -1px 0 0 0 #07806B,        /* left wall (lighter) */
  inset 1px 1px 0 0 rgba(255,255,255,0.15),   /* frustum top-left bevel */
  inset -1px -1px 0 0 rgba(0,0,0,0.2);        /* frustum bottom-right bevel */
text-shadow: 0 1px 1px rgba(0,0,0,0.3);       /* embossed text */
/* + btn-texture ::after pseudo for matte grain */

/* Active (pressed): */
background: linear-gradient(180deg, #07806B 0%, #0A9981 100%);
border-top-color: transparent;
box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);  /* sinks flush into keywell */
text-shadow: none;
/* no translateY — presses in, not down */
```

#### Reject Button (`btn-thick-red`) — Exact CSS
```css
background: linear-gradient(180deg, #F75565 0%, #F23545 100%);
border: none;
border-top: 1px solid rgba(255,255,255,0.25);
box-shadow:
  0 4px 0 0 #8A1620,        /* bottom wall (darkest) */
  2px 0 0 0 #A81C28,        /* right wall */
  2px 4px 0 0 #8A1620,      /* corner */
 -1px 0 0 0 #D42A3A,        /* left wall (lighter) */
  inset 1px 1px 0 0 rgba(255,255,255,0.15),
  inset -1px -1px 0 0 rgba(0,0,0,0.2);
text-shadow: 0 1px 1px rgba(0,0,0,0.3);

/* Active (pressed): */
background: linear-gradient(180deg, #D42A3A 0%, #F23545 100%);
border-top-color: transparent;
box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
text-shadow: none;
/* no translateY — presses in, not down */
```

#### Navy Button (`btn-thick-navy`) — Exact CSS
```css
background: linear-gradient(180deg, #2D5F8A 0%, #234B6E 100%);
border: none;
border-top: 1px solid rgba(255,255,255,0.25);
box-shadow:
  0 4px 0 0 #142F47,
  2px 0 0 0 #1A3D5C,
  2px 4px 0 0 #142F47,
 -1px 0 0 0 #1E4668,
  inset 1px 1px 0 0 rgba(255,255,255,0.15),
  inset -1px -1px 0 0 rgba(0,0,0,0.2);
text-shadow: 0 1px 1px rgba(0,0,0,0.3);

/* Active (pressed): */
background: linear-gradient(180deg, #1C3E5C 0%, #234B6E 100%);
border-top-color: transparent;
box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
text-shadow: none;
/* no translateY — presses in, not down */
```

#### Shared properties (all btn-thick-* classes)
```css
font-size: 0.75rem;
letter-spacing: 0.04em;
text-transform: uppercase;
font-weight: bold;
transition: all 0.08s ease;
/* ::after pseudo-element from btn-texture adds matte grain overlay */
```

### Form Inputs — Two Distinct Classes

The physical UI principle: **buttons pop OUT, text fields sink IN.** These are opposite treatments that reinforce the hardware metaphor.

#### `input-field` — Filter Controls (Keycap, pops OUT)
Used for: filter bar selects, date pickers, search inputs — interactive controls that behave like buttons.
- Same keycap treatment as `btn-thick-white` — gradient face, 4px side walls, matte texture
- **Face:** `linear-gradient(180deg, #FFFFFF 0%, #E8EAED 100%)`
- **Side walls:** bottom #9EA2A8, right #B0B4BA, left #C8CCD0
- **Active:** presses in (inset shadow, no translateY)
- **Focus:** all 4 walls change to `var(--primary)` + subtle glow
- Sharp corners, `btn-texture` matte overlay

#### `input-recessed` — Edit Form Fields (Recessed, sinks IN)
Used for: text inputs, number fields, textareas, selects in edit/create forms inside preview modals.
- **Inner shadow (top/left):** `inset 0 2px 4px rgba(0,0,0,0.12)` + `inset 2px 0 3px rgba(0,0,0,0.04)` — wall of the hole casting shadow onto the text area
- **Outer highlight (bottom):** `0 1px 0 0 rgba(255,255,255,0.85)` — light hitting the bottom lip of the hole
- **Paper feel:** off-white interior `#FAFBFC` — surface designed for digital ink
- **Border:** directional — top/left darker (`#A8ABB2`, `#B0B3BA`), bottom lighter (`rgba(255,255,255,0.7)`)
- **Focus:** border turns `var(--primary)` with subtle outer glow ring
- **No translateY, no side walls** — inputs don't move when clicked, they're already sunk in
- Sharp corners, no border-radius

#### When to use which
| Context | Class | Why |
|---------|-------|-----|
| Filter bar selects/dates | `input-field` | Acts like a button — user clicks to change state |
| Search bar in toolbar | `input-field` | Filter control |
| Edit form text/number input | `input-recessed` | User types data — recessed slot for digital ink |
| Edit form select/date | `input-recessed` | Inside edit form, consistent with sibling fields |
| Create modal fields | `input-recessed` | Same as edit forms |

### GL Account Dropdown (`GlAccountSelect`)
Styled as a **physical keycap button** matching action buttons — not a standard form input.

**Closed state:** Full-width `btn-thick-navy` button displaying selected GL account or placeholder text, with chevron icon. Same 3D raised look, gradient, shadow walls, and press-down feel as Approve/Reject.

**Open/search state:** Button appears pressed down (`translateY(4px)` + inset shadow, like `:active` state) with inline text input for searching. White text on dark background (`#1C3E5C`), white caret, placeholder at 60% opacity.

**Dropdown list:** Rendered via `createPortal` to `document.body` with `position: fixed` — **escapes any `overflow: hidden/auto` container** so it extends outside preview modals globally. Section headers use `font-label` stamped style. Items highlight with `var(--primary)` on hover/keyboard navigation.

**Portal pattern (important):** The dropdown uses fixed positioning calculated from the trigger button's `getBoundingClientRect()`. Click-outside detection checks both the container ref and the portal dropdown ref. This ensures the dropdown is never clipped by scrollable parent panels.

### Clickable Entity Cards (Expand-to-Preview Pattern)
When displaying a list of matched/linked entities (invoices, claims, sales invoices), use `btn-thick-white` as the card. Clicking the card:
1. **Selects** the item (highlights blue)
2. **Expands** inline document preview below the card (Google Drive iframe or thumbnail)
3. Clicking again **collapses** the preview

Used in: bank recon transaction preview (matched items), bank recon match modal (outstanding items), invoice preview modal (line items).

### Tables — Physical Machine Chassis

Tables are housed in a machine casing. Data slides under a metal faceplate header.

#### 1. Chassis (`ds-table-chassis` on `<table>`)
The outer frame — molded plastic casing housing the unit.
- Thick border (`3px solid #C0C4CA`), top lighter, bottom darker
- Heavy drop shadow (`0 4px 12px`) — physical unit sitting on the page
- Inner bevel for molded rim feel
- `overflow: hidden` to contain children

#### 2. Header (`ds-table-header` on `<tr>`)
Metal faceplate / brushed aluminum control bar. Data slides under this.
- **Gradient:** `linear-gradient(180deg, #E8EAED → #D8DBDF → #CCCFD4)` — brushed aluminum
- **Top highlight:** `1px solid rgba(255,255,255,0.7)` — specular edge
- **Bottom groove:** `1px solid #A8ABB0` + `0 1px 0 rgba(255,255,255,0.5)` — seam where faceplate meets first row
- **Stamped text:** debossed with dual text-shadow (white below, dark above) — etched into metal
- Lato bold uppercase `tracking-widest`

#### 3. Rows (`ds-table-row` on `<tr>`)
Removable slabs/modules in a rack.
- **Double-line seam:** `border-bottom: 1px solid #D8DBDF` + `box-shadow: inset 0 -1px 0 rgba(255,255,255,0.7)` — dark line + light line = physical gap between slabs
- **Hover:** lift effect — `translateY(-1px)` + shadow underneath = drawer pulled out from cabinet
- Alternating white / `bg-[var(--surface-low)]`
- **Density:** 40-48px rows

#### 4. Checkboxes (`ds-table-checkbox` on `<input>`)
Recessed toggle switches, not standard web checkboxes.
- **Unchecked:** recessed square with inset shadow, off-white surface, directional border
- **Checked:** green gradient fill + glowing LED dot (`::after` pseudo) — switch flipped to ON
- LED glow bloom: `box-shadow: 0 0 4px rgba(10,153,129,0.35)`

#### 5. Amount Column
Standard styling — right-aligned, `tabular-nums`, `font-semibold`, `text-[var(--text-primary)]`. No special visual treatment.

#### 6. Column Label Tooltip (`data-col`)
Every `<td>` in data tables must have a `data-col` attribute with its column name. On hover, a compact dark tooltip appears instantly at the top of the cell via CSS `::after`. This helps users identify columns when scrolled far from the header.
- **Attribute:** `data-col="Amount"` on each `<td>`
- **CSS:** `.ledger-binding tbody td[data-col]:hover::after` — `content: attr(data-col)`
- **Style:** dark pill (`var(--text-primary)` bg, white text, 0.5rem uppercase, 1px 5px padding)
- **Position:** absolute, top of cell, centered horizontally
- **No JS required** — pure CSS, zero performance cost

### Global Search (`GlobalSearch.tsx`)

Universal search accessible from every page via a `btn-thick-navy` **SEARCH** button in the page header + **Cmd+K** shortcut.

#### Architecture
- **Button:** `SearchButton` component dispatches `open-global-search` event
- **Sidebar** listens for the event + Cmd+K, renders `GlobalSearch` modal
- **API:** `POST /api/search` — 5 parallel Prisma queries (claims, invoices, bank transactions, suppliers, employees), role-scoped
- **Hook:** `useGlobalSearch` — 300ms debounce, AbortController, min 2 chars
- **Preview:** `GET /api/search/preview?type=claim&id=xxx` — fetches single entity for preview when not in current table view

#### Result Display
Results grouped by category with `ds-table-header` section headers. Each result shows:
- **Primary line:** date, name/description, amount, status badge
- **Context line** (10px, secondary): parent entity info so user knows where the item lives
  - Claims: `employee · firm · category`
  - Invoices: `firm`
  - Bank Transactions: `bank name + account number · firm`
  - Suppliers: `firm`
  - Employees: `phone · email`

#### Click Behavior
- Navigates to entity page with `?preview=<id>` query param
- Page detects param, fetches item via `/api/search/preview` if not in current table data, opens existing preview modal
- URL cleaned after preview opens

### Invoice GL Auto-Suggest & Supplier Learning

Full flow from upload to approval:

#### 1. Upload (OCR → Vendor → Supplier Match)
- OCR extracts `vendor_name_raw` from the document
- **Supplier matching** (automatic):
  1. Check `SupplierAlias` table for exact vendor name match → link supplier
  2. If no alias, fuzzy match existing supplier names → auto-suggest
  3. First manual allocation saves vendor name as `SupplierAlias` for future auto-match

#### 2. Preview (GL Auto-Suggest)
When accountant opens the invoice preview, GL accounts auto-fill:

**Expense GL (Debit) — resolution order:**
1. Invoice's saved `gl_account_id`
2. Supplier's `default_gl_account_id`
3. Supplier alias lookup GL
4. Category → GL mapping
5. Empty (accountant must select)

**Contra GL (Credit) — resolution order:**
1. Invoice's saved `contra_gl_account_id`
2. Supplier's `default_contra_gl_account_id`
3. Supplier alias lookup contra GL
4. **Fuzzy name match**: vendor name words matched against Liability GL account names (2+ word overlap)
5. Firm default Trade Payables GL
- If resolved contra = firm default, still runs fuzzy name match for a supplier-specific sub-account

#### 3. Approval (GL Saved to Supplier)
When accountant approves with a selected contra GL:
- **Always saves** `default_contra_gl_account_id` to supplier record (overwrites generic default)
- Expense GL saved to supplier if not already set
- Next invoice from this supplier auto-fills both GL accounts

#### 4. Confirmation Modal
Before posting, shows JV preview: Debit (Expense GL + amount) and Credit (Contra GL + amount). Accountant confirms before JV is created.

### Dashboard Cards — Housing + Pressable Tiles

#### Housing (`dash-housing`)
The outer card is a fixed, non-pressable recessed panel — a window into the machine.
- **Background:** `#ECEEF1` — slightly darker than the page, different material
- **Recessed:** inset shadow on top/left (`inset 0 2px 4px rgba(0,0,0,0.08)`) — carved into the dashboard
- **Lip highlight:** bottom/right outer edges have white glow (`0 1px 0 rgba(255,255,255,0.7)`) — where the material was cut
- **Stamped label:** section title (EXPENSE CLAIMS, etc.) has debossed text-shadow

#### Inner Tiles (`dash-tile`)
Individual pressable keycap keys sitting inside the housing — same physical style as `btn-thick-white`.
- **Keycap style:** gradient face `#FFFFFF → #EDEFF1`, 4px side walls (`#b8bcc2` bottom, `#d1d5db` right), frustum bevel, matte texture
- **Fixed height:** `min-height: 68px` with flexbox centering — all tiles same height regardless of label length
- **Hover:** side walls darken slightly
- **Active:** presses IN (inset shadow, no translateY) — same as all physical buttons
- **Labels:** Lato 10px bold uppercase
- **Values:** Lato extrabold `text-xl tabular-nums`
- **Amounts:** 10px medium, right-aligned

### Status Badges (Acrylic Block — sits ON surface)
Physical frosted acrylic blocks fused to the panel surface. No keywell/pit. LED dot blooms color through the block.

- **No key well:** Badge sits on top of / is fused to the panel surface, not recessed into a pit
- **Specular highlights (polished glass):** Sharp 1px bright white `border-top: rgba(255,255,255,0.95)` + `inset 0 1px 0 rgba(255,255,255,0.85)` interior highlight. `::before` pseudo adds a tiny 6px light-flare glint in top-left corner — polished to a high shine
- **Fused to chassis:** Tight dark contact shadow (`0 1px 1px rgba(0,0,0,0.12)`) right at the base. No soft/large shadows (implies travel). Darker `border-bottom` (18% opacity) = crisp bezel line
- **Light bead at bottom:** `0 2px 0 rgba(255,255,255,0.4)` — reflection where clear plastic meets the metal panel
- **Gradient face:** Subtle top-to-bottom gradient within the color family (lighter top, slightly saturated bottom)
- **Etched text:** `text-shadow: 0 1px 0 rgba(255,255,255,0.7)` — label pressed into polished acrylic
- **LED dot:** The colored circle is the actual emitter source point at the base of the block. Radial gradient with bright core fading to saturated edge. Double glow (`box-shadow: 0 0 4px` inner + `0 0 8px` outer bloom). The block itself "blooms" with that color.
- Sharp corners, 10px bold uppercase, `letter-spacing: 0.06em`

| Class | Gradient | Text | Bezel |
|-------|----------|------|-------|
| `badge-green` | #F0FAF0 → #E0F2E1 | #145A1E | green 12% |
| `badge-amber` | #FFF8EE → #FFF0DB | #C43E00 | orange 15% |
| `badge-red` | #FFF0EF → #FFDAD6 | #7A0009 | red 12% |
| `badge-blue` | #E8EEF8 → #D6E0F1 | #1A3D5C | navy 12% |
| `badge-gray` | #F5F6F8 → #EDEEF0 | text-secondary | black 8% |
| `badge-purple` | #FAF0FC → #F0E3F5 | #5A1580 | purple 12% |

### Notification Badges — Jewel Hemispheres
Physical translucent acrylic jewels with internal glow. Use `.notification-badge` or `.sidebar-badge` on a `<span>` inside a `relative` parent. Positioned `absolute -top-1.5 -right-1`. Never inline.

- **Jewel geometry:** `radial-gradient(circle at 40% 35%, #FF7A85 → #F75565 → var(--reject-red) → #C42030)` — hemisphere with lighter center, darker shoulder edges
- **Shoulder highlight:** `inset 1px 1px 1px rgba(255,255,255,0.35)` — crisp 1px white arc at top-left, light hitting the curve of a plastic bead
- **Physical height:** tight drop shadow (`0 1px 2px rgba(0,0,0,0.4)`) — sitting on the surface
- **Internal glow:** `0 0 6px 1px rgba(242,53,69,0.45)` — translucent red acrylic with a light behind it
- **Stamped text:** off-white `#FFFEF0` + `text-shadow: 0 -1px 0 rgba(0,0,0,0.25)` — number etched/indented into the red plastic
- **Sidebar variant (`.sidebar-badge`):** adds `outline: 1px solid rgba(0,0,0,0.25)` — dark rim simulating a drilled socket where the jewel is pressed into the blue groove material
- **Tab variant (`.notification-badge`):** overlaps the corner of the tab, pinching badge and tab together as one joined object

### Modals
- **Centered** always
- **Scrim:** #070E1B at 40% opacity, 2px backdrop-blur
- **Click outside to close:** centering wrapper must have `onClick` to close modal; modal box must have `onClick={(e) => e.stopPropagation()}`. Mandatory for ALL modals.
- **Header:** `bg-[var(--primary)]`, white text, bold uppercase tracking `h-12`
- **Footer:** `bg-[var(--surface-low)]`
- Sharp corners throughout

### Detail Preview Modals (Side-by-Side Pattern)
**ALL entity detail views** must use a **two-panel layout**. This applies to: invoices, claims, receipts, mileage, supplier accounts, bank recon transactions — every preview modal in the app.

- **Left panel** (`w-2/5`): scrollable details — fields, status badges, GL accounts, supplier info, edit forms
- **Right panel** (`w-3/5`): document preview (Google Drive iframe if `file_url` has `/d/` pattern, thumbnail fallback, "No document available" placeholder) + action buttons at bottom in `bg-[var(--surface-low)]` footer
- `max-w-[1100px]` to `max-w-[1200px]`, `max-h-[90vh]`
- Action buttons (`Approve`, `Confirm`, `Edit`, `Delete`) sit at the bottom of the right panel
- Disabled buttons show instant CSS tooltip on hover explaining why (e.g., "Unmatch in Bank Recon first", "Remove payments/bank recon first", "Revert approval first")
- **Never open a second modal on top** of a preview modal for document viewing — use inline iframe expand or show the document in the right panel
- **Delete button blocked** (greyed out with hover tooltip) when entity has downstream links (payments, bank recon, approved JVs)

### Nav Actuator Strips (Prev/Next Navigation)
Keycap-style navigation strips flanking preview modals. Same material as `btn-thick-navy`.

- **Position:** `absolute` relative to the modal box — sits at the modal edges, NOT screen edges
- `left: -3.5rem` (prev) / `right: -3.5rem` (next), `top: 0`, `bottom: 0`, `width: 3rem`
- Modal box must have `relative` positioning to contain them
- Keyboard: `ArrowLeft`/`ArrowRight` with visual press feedback (`nav-actuator-pressed` class)
- CSS classes: `nav-actuator`, `nav-actuator-left`, `nav-actuator-right`, `nav-actuator-pressed`
- Applied to: invoices, claims, suppliers, bank recon preview, bank recon match modal

**Bank recon match modal:** Two-panel layout (left=transaction details with always-visible editable textarea for description + date/amount/ref/bank info, right=search/tabs/items list/create forms). `max-w-[1200px]`.

**Bank recon table rows:**
- Debit rows: `bg-red-50/40` tint
- Credit rows: `bg-green-50/30` tint
- No alternating grey/white
- Hover shows instant full-description tooltip (CSS, not native `title`)
- Click matched/suggested rows → preview modal; click unmatched rows → match modal directly

**Supplier list:** Table rows (not cards) with columns: Supplier, Firm, Invoices, Net Outstanding, Actions (Pay/Statement/Edit as punchy 3D buttons). Row tint: red if owes, green if due, blue if selected. Click row → two-panel preview modal.

**Inline invoice preview:** Within supplier preview modal, clicking an invoice row expands an inline Google Drive iframe below the row (not a separate modal). Blue-50 highlight on selected row. Fallback to detail fields if no document.

**Editable description fields:** Always show as a visible textarea (`input-recessed` class in edit forms, `input-field` in filter contexts), not hidden behind "Click to edit". Save/Cancel buttons appear only when content differs from saved value.

**Expand-to-preview fallback:** When a clickable entity card has no document (no `file_url`), show inline detail panel (type, number, date, total, remaining) instead of empty space

**Dashboard tab buttons:** Keycap tiles sliding in a milled track. The track is a darker recessed groove (`bg-[#D0D3D8]`, inset shadow, `gap-0.5`) so the darker channel shows between tiles as a 2px seam. Active tab = `btn-thick-navy`, inactive = `btn-thick-white`. Count badges use `.notification-badge` overlay.

**Dashboard preview modals:**
- **Invoice preview:** Uses shared `InvoicePreviewPanel` (not inline code). Full approve/reject/edit/GL/line items/nav actuators.
- **Claim preview:** Inline (shared `ClaimPreviewPanel` lacks GL selection + approve/reject — TODO to migrate).
- **Preview data fetching:** Single `Promise.all` with all fetches (invoice data, GL accounts, categories, settings, suppliers, alias lookup). Never scatter fetches across multiple useEffects — one batch, one render cycle, with cancellation cleanup.
- **Full invoice data:** Fetched via `GET /api/invoices/{id}` on preview open (dashboard table has minimal data, shared component needs full shape).

### Sidebar — Raised Slab
The sidebar is a thick slab of material sitting ON TOP of the page. The main content area is a milled well carved below it.

- **Width:** `w-52` (208px)
- **Background:** solid `var(--primary)` (#234B6E)
- **Drop shadow:** `10px 0 20px -5px rgba(0,0,0,0.15)` — slab casts shadow right onto the white milled well
- **Leading edge highlight:** `border-right: 1px solid rgba(255,255,255,0.15)` — slab corner catching overhead light before it drops off into shadow
- **z-index: 10** — sidebar visually sits above the content
- **Nav buttons (`btn-thick-sidebar`):** Molded keycap tiles on the slab surface
  - **Molded bevel:** `border-top: 1px solid rgba(255,255,255,0.18)` (top highlight) + `border-bottom: 1px solid rgba(0,0,0,0.25)` (bottom shadow) — even same-color buttons have volume
  - **Seam:** `margin-bottom: 1px` + `0 2px 0 rgba(255,255,255,0.06)` — dark line (border-bottom) then light line (box-shadow) = v-groove between separate modules
  - **Gradient:** top-to-bottom `#3272A0 → #2A6088 → #234B6E` — lit from above
  - Stamped text (`text-shadow: 0 -1px 0 rgba(0,0,0,0.3)`)
- **Active page (`btn-thick-sidebar-active`):** Pressed in + backlit translucent panel (powered on)
  - `inset 0 2px 4px rgba(0,0,0,0.08)` — pressed into the slab
  - `0 0 8px rgba(255,255,255,0.3)` — soft outer glow, backlit panel activated
  - White background — translucent panel powered on
- **Notification badges:** red pill (`var(--reject-red)`, `rounded-full`)
- **Bottom section:**
  - **Firm selector:** darkest `#1A3D5C`, `btn-thick-sidebar` keycap
  - **User info — milled-in recess:** carved slot into sidebar surface
    - `background: rgba(0,0,0,0.15)` — darker than surrounding material
    - `box-shadow: inset 0 2px 4px rgba(0,0,0,0.25), inset 0 1px 1px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.07)` — inset shadow on top/left, highlight at bottom edge
    - `border-top: 1px solid rgba(0,0,0,0.2)` — sharp lip at top of carved slot
    - Text has `text-shadow: 0 1px 2px rgba(0,0,0,0.3)` — etched into surface
    - Same horizontal padding as nav (`px-3` within parent `px-3`)
  - **Sign out button:** `btn-thick-white` physical keycap — white gradient, 4px bottom wall, press-in animation

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

### Header Console (L-Frame Upper Panel)
The header is part of the L-shaped frame (sidebar + header) that wraps around the milled workspace. Same elevated material as the sidebar slab — auto-applied via `.ledger-binding > header`.

- **L-frame:** header shares the sidebar's elevated plane, creating a solid molded shell around top + left
- **Etched greeting:** dark grey `#2A3440` + `text-shadow: 0 1px 0 rgba(255,255,255,0.8)` — letterpress effect, text physically indented into the console surface
- **Date readout:** recessed LCD strip — `background: #EEF0F3`, inset shadow, thin border with directional colors. Dark text `#2A3440`, `0.875rem` bold — same visual weight as the greeting
- **Horizon seam:** double-line crease where console meets workspace — `0 1px 0 #D0D3D8` (dark line) + `0 2px 0 rgba(255,255,255,0.7)` (light highlight) = physical crease in the material
- **Console shadow:** `0 4px 8px rgba(0,0,0,0.06)` — header casts shadow down onto the workspace

### Signature Effects
- **Paper texture:** subtle dot-grid on main content (`paper-texture` class)
- **Milled well:** `ledger-binding::before` adds inset shadow on the left edge (sidebar overhangs), `::after` adds inset shadow below the header (console overhangs). Content is a different, recessed material.
- **Inset shadow:** engraved feel on badges (`inset-shadow` class)

---

## 7. Do's and Don'ts

### Batch Upload Review Modal
Grid layout per item — 4 columns:
```
Row 1: Vendor | Invoice # | Date    | Amount (RM)
Row 2: Category | Supplier | Due Date | Terms
Row 3: Notes (col-span-4)
```
- Supplier dropdown: `<select>` with "Auto-match" default + firm-scoped supplier list
- All `input-recessed` fields
- OCR-filled fields get `auto-suggested` class (amber glow — see below)
- Duplicate items: red border, deselected, message shown
- Preview panel: 40% right pane, PDF iframe or image

### Auto-Suggest Indicator (`auto-suggested`)
Soft amber glow on `input-recessed` fields that were auto-filled by OCR or system defaults. Tells the accountant "this was machine-filled — verify before submitting."

- **Border:** amber tones (`#E8A940` sides, `#D49530` top) — replaces default grey
- **Outer glow:** `0 0 0 2px rgba(232,169,64,0.18)` — subtle amber ring
- **On focus:** reverts to standard blue focus ring (user is now editing, no longer auto-suggested)
- **Usage:** add `auto-suggested` class alongside `input-recessed` when the field has an OCR/default value
- Matches existing amber semantic: `badge-amber` = "suggested", `led-amber` = "pending attention"

```css
.input-recessed.auto-suggested {
  border-color: #E8A940;
  box-shadow: ..., 0 0 0 2px rgba(232,169,64,0.18);
}
```

### Bank Recon Match Modal — Multi-Select Pattern
Invoices and claims both support multi-select with `ds-table-checkbox` (green LED glow checkboxes).

**Invoices — grouped by supplier:**
- Invoices grouped by supplier name (like claims by employee)
- Supplier header row: checkbox (select all for supplier) + "ACCOUNT" badge + supplier name + total
- Individual invoice rows: indented with checkbox + INV/SALES badge + reference + remaining amount
- Header only shown when supplier has 2+ invoices
- Running total shown in section header when items selected
- API called once per invoice (supports incremental allocation on same bank transaction)

**Claims — grouped by employee:** Same pattern, with "CLAIMS" badge and employee name.

**Confirmation modal:** Shows JV preview with correct matched amount (not bank transaction amount), partial match warning when amounts differ. Multi-item: one debit/credit line per item + bank GL total.

**Suggested transactions — forced review flow:**
- Table shows "Review" button (dark gold keycap: `#F5C842→#E8B830`, amber side walls, black text) + "Unmatch" (red)
- No "Confirm" or "Confirm All" in the table — forces accountant to open preview first
- Preview modal: "Confirm" button has red hover tooltip: "Auto-suggested match — review before confirming"
- Hint text replaces Confirm All: "{n} suggested — click Review to confirm"

**Partial match indicator:**
- Table status badge: "Partial" (amber) when matched amount < bank transaction amount
- Preview modal: same "Partial" badge
- JV preview: shows correct matched amount, not bank transaction amount

### JV Confirmation Modals — Required for ALL JV Actions
Every button that creates or reverses a Journal Entry **must** show a confirmation modal. No direct action.

**Creating JV (green header `bg-[var(--match-green)]`):**
- Summary card: entity name + amount
- JV preview table: Account / Debit / Credit columns
- Multi-item: one row per item + bank GL total
- Partial match: amber warning with remaining amount
- Button: "Confirm & Post JV" (green)

**Reversing JV (red header `bg-[var(--reject-red)]`):**
- Summary card: entity name + amount
- "The following will be reversed:" bulleted list
- Lists: JV reversal, GL accounts affected, status resets
- Button: "Confirm Revert" or "Confirm Unmatch" (red)

### Do
- Use CSS variables for ALL colors — never hardcode hex in page files
- Use white space as a separator — increase padding, don't add lines
- Use `tabular-nums` on all financial data for column alignment
- Use the punchy 3D button system for ALL interactive elements
- Use sharp corners (0px radius) on everything except notification badges
- Use `paper-texture` + `ledger-binding` on main content areas
- Use `card-popped` on cards and stat card icons
- Use `btn-thick-sidebar` for nav; active = white button with `var(--primary)` text
- Use `input-field` for filter controls (keycap, pops out) and `input-recessed` for edit form fields (sinks in)
- When a big container block has small buttons inside, use `onMouseDown` + `stopPropagation` on the container so clicking a small button doesn't press the big block down too. Big block press = click anywhere except buttons. Small button press = only that button.

### Don't
- Use 1px borders to separate cards or table rows
- Use pure black (#000000) — always `var(--text-primary)` (#191C1E)
- Use standard drop shadows — use card-popped directional borders
- Use rounded corners on buttons, cards, modals, inputs, or badges
- Use any font other than Lato — single font system, no exceptions
- Use gradient fills on buttons — flat color + 3D borders only
- Make active sidebar button same color as inactive — use white to distinguish
- Hardcode hex colors in page files — all colors from CSS variables

---

## Global Search (`Cmd+K`)

### Implementation
| File | Role |
|------|------|
| `app/api/search/route.ts` | 5 parallel Prisma queries, role-scoped |
| `components/GlobalSearch.tsx` | Modal UI, keyboard nav, result grouping |

### Entities Searched
Claims, Invoices, Bank Transactions, Suppliers, Employees — all in parallel via `Promise.all()`, max 6 results per type.

### Firm Scoping
- **Accountant**: scoped to assigned firms (null = all)
- **Admin**: scoped to own firm_id
- **Employee**: own claims only

### Navigation
Clicking a result navigates to the entity's list page with `?preview=[id]` query param, which auto-opens the preview modal. "View all" navigates with `?search=[query]`.
