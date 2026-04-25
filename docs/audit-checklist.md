# Audit Checklist

Rules and patterns established during development. The `/audit` skill should verify each item.

---

## 1. Voucher Number Prefixes

Every `createJournalEntry()` call with `sourceType: 'bank_recon'` must pass an explicit `voucherPrefix`:
- Invoice match → `'PV'`
- Sales invoice match → `'OR'`
- Claim match → `'CR'`

Other source types use defaults: `invoice_posting` → PI, `sales_invoice_posting` → SI, `manual` → user-chosen, `year_end_close` → JV.

Reversals must preserve the original prefix (extracted from `voucher_number.split('-')[0]`).

**Files to check:** All files that call `createJournalEntry` — grep for `createJournalEntry(` across the codebase.

**Status:** ✅ All 17 calls verified correct (2026-04-24)

---

## 2. Table Row Stability

Tables must never rearrange rows after any action (confirm, match, unmatch, approve, reject).

### API Sort Order
Every list API used by a table must have a deterministic `orderBy` with a unique final key (`id`):
```
orderBy: [{ primary_sort: 'asc' }, { created_at: 'asc' }, { id: 'asc' }]
```

**Check these APIs:**
- `app/api/bank-reconciliation/statements/[id]/route.ts` — ✅
- `app/api/admin/bank-reconciliation/statements/[id]/route.ts` — ✅
- `app/api/invoices/route.ts` — ✅ fixed 2026-04-24
- `app/api/admin/invoices/route.ts` — ✅ fixed 2026-04-24
- `app/api/sales-invoices/route.ts` — ✅ fixed 2026-04-24
- `app/api/admin/sales-invoices/route.ts` — ✅ fixed 2026-04-24
- `app/api/claims/route.ts` — ✅ fixed 2026-04-24
- `app/api/admin/claims/route.ts` — ✅ fixed 2026-04-24
- `app/api/journal-entries/route.ts` — ✅ fixed 2026-04-24
- `app/api/suppliers/route.ts` — ✅ fixed 2026-04-24
- `app/api/employees/route.ts` — ✅ fixed 2026-04-24
- `app/api/admin/employees/route.ts` — ✅ fixed 2026-04-24
- `app/api/audit-log/route.ts` — ✅ fixed 2026-04-24
- `app/api/categories/route.ts` — ✅ fixed 2026-04-24
- Any other API that returns a list for a table

### Scroll Preservation
When reloading data after an action, save `scrollTop` before setState, restore via `requestAnimationFrame`:
```typescript
const scrollTop = scrollRef.current?.scrollTop ?? 0;
setData(newData);
requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollTop; });
```

**Check these components:**
- `BankReconDetailContent.tsx` — ✅ `doConfirm`, `advanceAfterMatch`
- `InvoicesPageContent.tsx` — ✅ fixed 2026-04-24
- `ClaimsPageContent.tsx` — ✅ fixed 2026-04-24
- `SalesInvoicesContent.tsx` — ✅ fixed 2026-04-24
- Any component that reloads table data after an action

---

## 3. GL Cache Pattern

Per-firm GL accounts, categories, and accounting settings must be cached via `useRef` so they load instantly after the first fetch. These don't change mid-session.

**Pattern:**
```typescript
const glCacheRef = useRef<Record<string, { glAccounts, categories, firmDefaultContra }>>({});
// On modal open: check cache[firmId] → instant, else fetch → cache
```

**Check these components:**
- `InvoicesPageContent.tsx` — ✅ applied
- `SalesInvoicesContent.tsx` — ✅ fixed 2026-04-24
- `BankReconDetailContent.tsx` — ✅ fixed 2026-04-24 (receiptGlAccounts state cache)
- `BankReconPreviewModal.tsx` — ✅ applied
- `SuppliersPageContent.tsx` — ✅ fixed 2026-04-24 (glCacheRef added)
- Any component that fetches `/api/gl-accounts`, `/api/categories`, or `/api/accounting-settings` per modal open

---

## 4. Sticky Table Footer (tfoot) with Totals

All data tables with an Amount column must have a sticky `<tfoot>` showing item count + total amount.

**Rules:**
- `<tfoot className="sticky bottom-0 z-10">`
- Each `<td>` must have its own `bg-[var(--surface-header)]` (bg on `<tr>` alone doesn't work with sticky)
- Total computed from the filtered/sorted array, not the paged subset
- Item count under first data column, total under Amount column

**Check these pages:**
- `InvoicesPageContent.tsx` — ✅ applied (td bg fixed 2026-04-24)
- `BankReconDetailContent.tsx` — ✅ applied (Total + Matched rows)
- `ClaimsPageContent.tsx` — ✅ applied
- `SalesInvoicesContent.tsx` — ✅ fixed 2026-04-24
- `app/accountant/journal-entries/page.tsx` — ✅ fixed 2026-04-24
- `SuppliersPageContent.tsx` — ✅ fixed 2026-04-24

---

## 5. Table Row Hover

All clickable table rows must have `hover:bg-[var(--surface-header)] transition-colors`.

**Check all pages with `<tr>` that have `onClick` + `cursor-pointer`.**

- `SalesInvoicesContent.tsx` — ✅ fixed 2026-04-24 (was hardcoded #F2F4F6)

---

## 6. Type Badges (PI/SI/PV/OR)

Invoice type badges must appear next to vendor/entity names everywhere invoices are listed:
- Invoices table — ✅ vendor column
- Bank recon match modal outstanding items — ✅ replaced INV/SALES with PI/SI/PV/OR
- Bank recon preview modal matched items — check

**Badge colors:**
- PI: `color: #234B6E, bg: #E3EDF6`
- SI: `color: #0E6027, bg: #DEF2E4`
- PV: `color: #7C3A00, bg: #FEF0DB`
- OR: `color: #5C2D91, bg: #EEDDF9`

Badge derived from invoice_number prefix first, fallback to item type.

---

## 7. Unified Bank Recon Preview Layout

All bank recon transaction preview states (suggested, confirmed, unmatched) must use the same two-panel layout:

**Left panel (1/2):**
- Transaction details (status badge, date, amount, balance)
- Description (read-only, not editable)
- Matched item info (invoice/sales invoice/claims/payment)
- Contra GL select (editable for suggested, disabled for confirmed)
- JV preview table (DR/CR lines)

**Right panel (1/2):**
- Document preview (auto-expanded if available)
- Action buttons (Confirm+Unmatch / Confirmed+Unmatch / Match)

**No conditional branching** — same layout for all states.

---

## 8. Bank Recon Match Modal — JV Preview in Left Panel

When user selects an invoice/claim in the match modal, a JV preview must appear in the **left panel** (below bank info), not in the footer or a separate modal.

---

## 9. Bank Recon After Match/Confirm Behavior

After any match action (match invoice, create PV, create OR, match claims, confirm suggested):
- Do NOT auto-advance to next unmatched transaction
- Close the match modal
- Open the preview modal on the **same** transaction showing updated status
- Table scroll position must be preserved

---

## 10. No Category Dropdown for Accountant PV

Payment Voucher creation form in bank recon match modal: category dropdown hidden for accountant (`config.showRichPreview`). Accountant selects GL account directly. Category only shown for admin.

API `create-voucher` routes accept `category_id` as optional (nullable).

---

## 11. Notes Column in Bank Recon

- Column header: "Notes" (not "Matched To")
- Shows `txn.notes` field
- When creating PV/OR with user-typed notes, those notes are saved to the bank transaction's `notes` field (not wrapped in auto-description)
- If no user notes, falls back to auto-description ("Official receipt — Supplier (OR-xxx)")

---

## 12. GL Add Account UX

`GlAccountSelect` component:
- `suggestedName` prop auto-fills account name from vendor/supplier name
- Code field accepts prefix only (e.g. `400`) → auto-completes to next available sub-number on blur (e.g. `400-011`)
- Parent inference works with or without dash — `400` finds `400-000` as parent
- Pass `suggestedName` everywhere `GlAccountSelect` is used with vendor context

---

## 13. Unified Invoices Page

Single page showing both purchase (Invoice) and sales (SalesInvoice) invoices:
- No RECEIVED/ISSUED sub-items in sidebar — single "INVOICES" link
- Fetches both APIs in parallel, normalizes SalesInvoice into InvoiceRow shape
- Type toggle buttons (PI/SI/PV/OR) — physical keycap style, multi-select
- Filter bar: plain date inputs (no preset dropdown), dropdowns for Status/Approval/Payment
- Type toggles use CSS classes `type-toggle-on` / `type-toggle-off` with CSS custom properties

---

## 14. Physical UI Consistency

All interactive elements must follow the design system's physical keycap treatment:
- Type toggle buttons must have 3D walls + press-in `:active` state
- Filter dropdowns use `input-field` class
- All buttons use `btn-thick-*` classes with `btn-texture`
- No flat/borderless interactive elements

**Status:** ✅ SalesInvoicesContent fixed 2026-04-24 (btn-primary → btn-thick-navy, btn-approve → btn-thick-green, btn-reject → btn-thick-red)

---

## 15. Date Display in Sidebar Only

Today's date is shown in the sidebar (between logo and nav), NOT in page headers. `SearchButton` must NOT include a date display. The sidebar is shared across all pages, so one location covers everything.

**Check:** `components/SearchButton.tsx` should have no date. `components/Sidebar.tsx` should have the date div above the nav.

**Status:** ✅ Verified correct (2026-04-24)

---

## 16. No Date Preset Dropdowns

Filter bars should show plain date inputs (start + end) directly — no "This Month / Last Month / Custom" preset dropdown. Entering a date auto-sets `dateRange` to `'custom'`. Default is empty (all time).

**Check these pages:**
- `InvoicesPageContent.tsx` — ✅ plain date inputs
- `app/accountant/journal-entries/page.tsx` — ✅ plain date inputs
- `ClaimsPageContent.tsx` — ✅ fixed 2026-04-24 (FilterBar component updated)
- `SalesInvoicesContent.tsx` — ✅ fixed 2026-04-24
- `FilterBar.tsx` — ✅ fixed 2026-04-24 (removed preset dropdown)

---

## 17. Journal Entries Type Badges + Toggles

Same PI/SI/PV/OR/CR/JV badge and toggle pattern as invoices page:
- Type badge next to voucher number (colored pill)
- Type toggle keycap buttons replacing "All Sources" dropdown
- Client-side filtering by voucher prefix
- Badge colors consistent with invoices page + CR (red) and JV (grey)

---

## 18. No Bottom Padding on Table Pages

`<main>` on table pages should use `pb-0` so the table/tfoot extends to the edge — no grey bar below the sticky footer.

**Check:** Any `<main>` with `p-8` that contains a table should be `pt-8 px-8 pb-0` instead.

- `InvoicesPageContent.tsx` — ✅ `pt-8 px-8 pb-0`
- `app/accountant/journal-entries/page.tsx` — ✅ fixed 2026-04-24
- `SuppliersPageContent.tsx` — ✅ fixed 2026-04-24
- `ClaimsPageContent.tsx` — ✅ fixed 2026-04-24
- `BankReconDetailContent.tsx` — ✅ fixed 2026-04-24

---

## 19. LoadMoreBanner Dismissible

The "Showing X of Y records" banner must have an X button to dismiss it. Uses local `useState` — resets on filter change/navigation.

**Check:** `components/LoadMoreBanner.tsx` has dismiss button.

**Status:** ✅ Verified correct (2026-04-24)

---

## 20. Strict Date Filtering

When date filters are set, only return items within that date range. No special bypass for pending items — if user sets a date range, they see exactly that range. When no date filter is active, all items are shown.

**No `OR` bypass clauses for pending status in any list API.**

---

## 21. Button Color Semantics

All buttons must use the correct `btn-thick-*` class based on their action type:
- **Green (`btn-thick-green`)** — proceed / save / approve / confirm (forward actions)
- **Red (`btn-thick-red`)** — reject / delete / revert / unmatch (reversing actions)
- **Navy (`btn-thick-navy`)** — primary CTA / create new entity / match
- **White (`btn-thick-white`)** — edit / cancel / close (neutral)
- **Amber (`btn-thick-amber`)** — review (suggested items needing confirmation)

Never use `btn-primary`, `btn-approve`, `btn-reject` — always use the `btn-thick-*` variants.

---

## 22. Confirm & Create Label

All confirmation buttons that create JVs or documents use the generic label **"Confirm & Create"** — not "Confirm & Create JV", "Confirm & Post JV", "Confirm Payment Voucher", etc. The system knows what it's creating; the user doesn't need to identify it.

---

## 23. Line Item Edit Mode Disables Actions

When editing line items on an invoice preview (`showLineItems` is true), Approve, Reject, and Mark as Reviewed buttons must be disabled (`disabled={showLineItems}` + `disabled:opacity-40 disabled:cursor-not-allowed`). User must save or cancel line items first.

---

## 24. DB Connection Pool

`lib/prisma.ts` uses a `pg` Pool with `max: 5` connections per serverless instance. The PrismaClient and Pool are cached globally via `globalThis` in ALL environments (including production). This prevents connection exhaustion on Vercel.

**Never remove the global caching or increase max beyond 10 without checking VPS `max_connections` (currently 200).**

---

## 25. GlAccountSelect Search Input Padding

The search input in `GlAccountSelect` must have `px-3` for proper left padding so placeholder text doesn't stick to the edge. The input inherits `btn-thick-navy` styling which has no built-in padding.

---

## 26. Sidebar Consolidated Counts

Sidebar badge counts must use a single `/api/sidebar-counts` endpoint — never 3 separate calls to claims/counts + invoices/counts + employees/pending.

**Status:** ✅ Fixed 2026-04-24

---

## 27. CSS-Only Tooltips

All tooltips must be pure CSS (`:hover` + `::after` or `group-hover`). No JS `onMouseEnter`/`onMouseLeave` state, no tooltip libraries.

- Status badges: `data-tooltip` attribute + CSS `::after` ✅
- Column labels: `data-col` attribute + CSS `::after` ✅
- HelpTooltip: CSS `group-hover` ✅ (converted from JS 2026-04-24)

---

## 28. API Fetch Batching (Promise.all)

Multiple fetches for the same action must use a single `Promise.all`. Never scatter across separate `useEffect` hooks or use sequential `await` calls.

**Status:** ✅ All pages verified 2026-04-24. ClaimsPageContent edit-mode fetch batched.

---

## 29. Contra GL Resolution Consistency

The contra GL suggestion algorithm must be identical everywhere invoices are previewed. The full chain:
1. Invoice's saved `contra_gl_account_id`
2. Supplier's `default_contra_gl_account_id`
3. Supplier alias lookup contra GL
4. Fuzzy name match (strips sdn/bhd/plt, full-string + 2-word overlap)
5. Firm default Trade Payables GL
- If resolved = firm default, still try fuzzy name match for supplier-specific sub-account

**Applied in:** InvoicesPageContent ✅, dashboard page ✅ (fixed 2026-04-24)

---

## 30. Firm Scoping TTL Cache

`getAccountantFirmIds()` in `lib/accountant-firms.ts` must have a 30-second TTL cache via in-memory Map to prevent hammering DB on every API call.

**Status:** ✅ Already implemented (30s TTL, keyed by userId)
