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

---

## 31. No N+1 Queries in Batch Routes

Batch API routes (approve/reject/revert N items) must never query inside a loop.

### Rules
- **Audit logs:** Use `batchAuditLog()` from `lib/audit.ts` (single `createMany`) — never loop `auditLog()`.
- **Pre-fetch lookups:** Collect unique IDs, fetch all in one `findMany({ where: { id: { in: ids } } })`, build a Map, then read from the Map inside the loop.
- **Relation filters:** Use `invoice: { supplier_id }` instead of pre-fetching IDs then filtering with `{ in: invIds }`.
- **Aggregate merging:** Use `aggregate({ _count: true, _sum: { field: true } })` instead of separate `count()` + `aggregate()` calls.

**Files to check:** `app/api/invoices/batch/route.ts`, `app/api/claims/batch/route.ts`, `app/api/admin/claims/batch/route.ts`, `app/api/admin/suppliers/[id]/statement/route.ts`, `app/api/suppliers/[id]/statement/route.ts`

**Status:** ✅ All batch routes fixed (2026-04-27)

---

## 32. Error Boundaries

Every route group must have an `error.tsx` file that catches rendering errors.

### Structure
- `app/global-error.tsx` — catches root layout errors, uses inline styles (no CSS vars)
- `app/error.tsx` — catches page errors, links to `/`
- `app/admin/error.tsx` — links to `/admin/dashboard`
- `app/accountant/error.tsx` — links to `/accountant/dashboard`
- `app/employee/error.tsx` — links to `/employee/claims`
- All use shared `components/ErrorPage.tsx` (except global-error which is self-contained)

**Status:** ✅ All error boundaries created (2026-04-27)

---

## 33. Firm Setup Guard on Uploads

All pages that allow file uploads must check if the firm has completed setup (COA + fiscal year) before allowing uploads.

### Implementation
- On page load, call `GET /api/accountant/firms/{firmId}/setup-status`
- If `chartOfAccounts.complete === false` or `fiscalYear.complete === false`:
  - Set `firmSetupReady = false`
  - Show amber warning banner with message + "Go to Setup" button linking to `/accountant/clients/{firmId}`
  - Block `handleDrop` with `alert()` + early return
- Admin pages skip this check (firm is always set up by accountant first)

### Files with guard
- `components/pages/InvoicesPageContent.tsx` — invoices upload (drag-drop + batch)
- `components/pages/ClaimsPageContent.tsx` — claims/receipts upload (drag-drop + batch)
- Any future upload page must include this guard

**Status:** ✅ Applied to invoices + claims (2026-04-27)

---

## 34. Batch Upload Overlay Pattern

All background upload/parse/scan operations must use the shared `components/BatchUploadOverlay.tsx` component for their minimized/progress state.

### Component API
```tsx
<BatchUploadOverlay
  active={boolean}        // whether operation is running
  label="Uploading..."    // text shown in the bar
  current={5}             // progress count
  total={20}              // total items
  onExpand={() => ...}    // click bar to reopen modal
  onCancel={() => ...}    // optional cancel button
  results={[...]}         // optional: show results summary after completion
  onDismiss={() => ...}   // dismiss results
/>
```

### Features provided
- Fixed bottom-right floating bar with spinner + progress %
- Progress bar fills as current/total increases
- "Click to expand" and optional "Cancel" in footer
- Results summary mode (succeeded/failed counts + details)
- Navigation blocker (sidebar locked during upload)
- `beforeunload` warning to prevent accidental page close

### Applied in
- `components/pages/InvoicesPageContent.tsx` — batch invoice upload + scan
- `components/pages/ClaimsPageContent.tsx` — batch claims/receipts upload + scan
- `components/onboarding/SetupCoaModal.tsx` — COA PDF parsing (minimized state)
- Any future upload, scan, or long-running parse operation must use this component

**Status:** ✅ Shared component, applied everywhere (2026-04-27)

---

## 35. Firm Setup Checklist Steps

The client detail page (`/accountant/clients/[firmId]`) has a setup checklist with 6 steps. All required steps must be complete before uploads are allowed.

### Required Steps (block uploads if incomplete)
1. **Firm Details** — name, registration number, contact email
2. **Chart of Accounts** — at least 1 GL account imported (template, copy, or PDF)
3. **GL Defaults** — Trade Payables + Staff Claims Payable must be set (`default_trade_payables_gl_id`, `default_staff_claims_gl_id`)
4. **Category → GL Mapping** — at least 1 `CategoryFirmOverride` with `gl_account_id` set
5. **Fiscal Year** — at least 1 fiscal year created

### Optional Steps
6. **Add Admin** — create admin user (not required for uploads)

### Setup Status API
`GET /api/accountant/firms/{firmId}/setup-status` returns completion status for each step.

### Sidebar Badge
The "Clients" nav item shows a badge count of firms with incomplete required setup. Computed in `/api/sidebar-counts` by checking COA, GL defaults, category mappings, and fiscal year per firm.

### Setup Modals (inline, no page navigation)
- Firm Details → opens edit panel on the page
- COA → `SetupCoaModal` (template / copy / PDF upload)
- GL Defaults → `SetupGlDefaultsModal` (4 dropdowns filtered by account type)
- Categories → `SetupCategoriesModal` (table of categories with GL account dropdowns)
- Fiscal Year → `CreateFiscalYearModal`
- Add Admin → opens admin modal on the page

**Status:** ✅ All steps implemented with inline modals (2026-04-27)

---

## 11. Batch Upload Global Context

All batch upload/scan/submit operations MUST use `useBatchProcess()` from `contexts/BatchProcessContext.tsx`. Never use local `useState` loops for batch operations — they die on navigation.

### Design Rule
- **`startScan()`** — for OCR scanning loops (invoices, claims). Worker closure captures page-specific data (categories, suppliers).
- **`startSubmit()`** — for upload/submit loops (all pages). Worker returns `{ name, ok, msg }` per item.
- **`BatchUploadOverlay`** renders from the provider globally — never render it from page components.
- `scan_done` phase keeps the floating bar visible until user clicks it → navigates to `returnPath` → review modal opens.
- `submit_done` phase shows results summary in floating bar.

### Migrated Pages
- `components/pages/InvoicesPageContent.tsx` — ✅ scan + submit
- `components/pages/ClaimsPageContent.tsx` — ✅ scan + submit
- `app/employee/claims/page.tsx` — ✅ submit only
- `app/admin/bank-reconciliation/page.tsx` — ✅ upload loop
- `app/accountant/bank-reconciliation/page.tsx` — ✅ upload loop

### TODO
- `components/onboarding/SetupCoaModal.tsx` — still local (single API call, would need returnPath to client detail page)
- Any future upload modal must follow this pattern

**Status:** ✅ All batch pages migrated (2026-04-27). SetupCoaModal deferred.

---

## 12. Google Drive File Cleanup on Delete

When a record with an attached file is deleted, the Google Drive file must be cleaned up.

### Pattern
- `deleteFileFromDrive(fileUrl)` in `lib/google-drive.ts` — extracts Drive file ID from URL, calls Drive API DELETE
- **Non-blocking** — DB delete succeeds even if Drive API fails (logs warning)
- Called AFTER the DB delete (not before)

### Covered Endpoints
- `app/api/invoices/delete/route.ts` — ✅
- `app/api/claims/delete/route.ts` — ✅
- `app/api/admin/claims/delete/route.ts` — ✅
- `app/api/bank-reconciliation/statements/delete/route.ts` — ✅
- `app/api/admin/bank-reconciliation/statements/delete/route.ts` — ✅

### TODO
- Sales invoice delete (if/when added)
- Historical orphan cleanup — planned for God Mode dashboard

**Status:** ✅ All delete endpoints cleaned up (2026-04-27)

---

## 13. Bank Recon GL Guard

Bank recon statement rows must not be clickable when the bank account has no GL assigned.

### Pattern
- **Accountant:** `bankGlMap[key]?.gl_account_id` check in row onClick — alerts "Please assign a GL account"
- **Admin:** `has_gl` field returned from statements API — alerts "Ask your accountant to assign GL"

### Files
- `app/accountant/bank-reconciliation/page.tsx` — ✅ client-side check
- `app/admin/bank-reconciliation/page.tsx` — ✅ client-side check + "No GL assigned" badge
- `app/api/admin/bank-reconciliation/statements/route.ts` — ✅ returns `has_gl` per statement

**Status:** ✅ Both roles blocked (2026-04-27)

---

## 14. Voucher PDF Generation for PV/OR

PV (Payment Voucher) and OR (Official Receipt) records without documents can generate a voucher-style PDF that attaches to the record.

### Pattern
- `lib/generate-voucher-pdf.ts` — client-side jsPDF, returns Blob
- Blob uploaded via `/api/invoices/[id]/attach` (PV) or `/api/sales-invoices/[id]/attach` (OR)
- `generated=true` flag skips OCR and dedup checks
- After upload, preview refreshes (or modal closes + refresh in bank recon)

### Files
- `components/invoices/InvoicePreviewPanel.tsx` — generate button for PV/OR without file
- `components/bank-recon/BankReconPreviewModal.tsx` — generate button for matched PV/OR
- `app/api/invoices/[id]/attach/route.ts` — accepts PV + OR, `generated` flag
- `app/api/sales-invoices/[id]/attach/route.ts` — new endpoint for OR records

### Schema
- `SalesInvoice` now has `file_url`, `file_download_url`, `thumbnail_url`, `file_hash` fields

**Status:** ✅ PV + OR generation working (2026-04-27)

---

## 37. Bank Recon GL Passthrough

When a GL account is chosen during PV/OR creation in bank recon, it must be saved to the record AND returned correctly in the preview API so the Contra GL dropdown shows the right value.

### The Rule
The `gl_account_id` field on Invoice (PV) and SalesInvoice (OR) stores the user-chosen GL. The bank recon preview expects `contra_gl_account_id` in the API response. The API must map:
- **Invoice (PV):** `contra_gl_account_id ?? gl_account_id ?? supplier.default_contra_gl_account_id`
- **SalesInvoice (OR):** `gl_account_id` returned as `contra_gl_account_id`

### Files
- `app/api/bank-reconciliation/statements/[id]/route.ts` — accountant: must return `matched_invoice`, `matched_sales_invoice`, `matched_claims` with GL fields
- `app/api/admin/bank-reconciliation/statements/[id]/route.ts` — admin: must be at parity with accountant version (was missing matched_invoice + matched_sales_invoice entirely)
- `app/api/bank-reconciliation/create-voucher/route.ts` — saves `gl_account_id` on Invoice
- `app/api/bank-reconciliation/create-receipt/route.ts` — saves `gl_account_id` on SalesInvoice
- `components/bank-recon/BankReconPreviewModal.tsx` — reads `contra_gl_account_id` from API response

### Admin-Accountant Parity
Admin statements/[id] API must return the exact same data shape as the accountant version: `matched_invoice`, `matched_invoice_allocations`, `matched_sales_invoice`, `matched_claims`, `matched_payment`.

**Status:** ✅ Fixed (2026-04-28) — admin brought to parity, GL fallback chain added

---

## 38. API Try-Catch Coverage

Every API route handler must be wrapped in try-catch with proper error responses (`500` with message).

**Status:** ✅ 100% coverage (96/96 routes) as of 2026-04-28. Was 38% missing before this session.

---

## 39. Bounded findMany Queries

Every `prisma.*.findMany()` call must have an explicit `take` limit to prevent unbounded result sets.

### Limits by context
- **Operational list APIs** (invoices, claims, etc.): `take: DEFAULT_PAGE_SIZE` (100, from `lib/constants.ts`)
- **Report/export APIs** (GL, trial balance): `take: 500`
- **Batch/internal APIs** (cron, migration): `take: 1000`

### Constant
`DEFAULT_PAGE_SIZE = 100` exported from `lib/constants.ts` — use this instead of hardcoding `100`.

**Status:** ✅ All 7 previously-unbounded routes fixed (2026-04-28)

---

## 40. Dead Endpoint Cleanup

Unused API endpoints must be deleted, not left in the codebase.

### Removed (2026-04-28)
- `app/api/claims/stats/route.ts` — replaced by sidebar-counts
- `app/api/claims/counts/route.ts` — replaced by sidebar-counts
- `app/api/admin/claims/stats/route.ts` — replaced by sidebar-counts
- `app/api/admin/claims/counts/route.ts` — replaced by sidebar-counts

### Optimized
- `sidebar-counts` claims query: 6 separate queries → single `groupBy`

---

## 41. Playwright E2E Test Suite

108 Playwright tests covering:
- 14 visual snapshots
- 4 user journeys (claim lifecycle, invoice lifecycle, bank recon, payment allocation)
- 3 destructive path tests (delete, restore, cascade)
- Page load tests for all roles
- JV integrity checks
- Permission boundary tests

**Status:** ✅ 108 tests passing (2026-04-28)

---

## 42. Restore Dedup Guard

When restoring a soft-deleted record, the restore API checks if a duplicate document was re-uploaded while the original was in the deleted state. If a live record with the same file hash or invoice number exists, restore is blocked with an error message.

**Status:** ✅ Implemented (2026-04-28)

---

## 43. OCR Fallback API Key

If the primary Gemini API key fails or is missing, OCR falls back to `GOOGLE_AI_API_KEY` env var (Google AI Studio free tier, no billing required).

**Status:** ✅ Implemented (2026-04-28)

---

## 36. Soft Delete System

Invoice, SalesInvoice, Claim, Payment, BankStatement use soft deletes (30-day grace period).

### Architecture
- `deleted_at DateTime?` + `deleted_by String?` on each model
- Prisma `$extends` in `lib/prisma.ts` auto-filters `WHERE deleted_at IS NULL` on all reads
- `prismaUnfiltered` export bypasses the filter (restore API + hard-delete cron only)
- SalesInvoice partial unique index: `WHERE deleted_at IS NULL` on `(firm_id, invoice_number)`
- Shared cascade logic in `lib/soft-delete.ts`

### Behavior
- On soft-delete: JV reversal + join table cleanup happens immediately (same as before)
- Record hidden for 30 days, Drive files preserved for viewing
- Restore → `pending_approval` (must re-approve for JVs)
- Hard-delete cron: `app/api/cron/hard-delete-expired/route.ts` (weekly, 30-day cutoff)

### Delete Endpoint Blockers (Phase 0 fix)
- SalesInvoice delete checks `SalesPaymentAllocation` count
- Payment delete checks both `PaymentAllocation` AND `SalesPaymentAllocation`
- Claims delete checks `PaymentReceipt`

### Pages
- Accountant: `/accountant/deleted-items`
- Admin: `/admin/deleted-items`
- Platform: `/platform/deleted-items` (cross-firm)
- All use shared `components/DeletedItemsPage.tsx`

### API
- `GET /api/deleted-records` — lists soft-deleted records (firm-scoped)
- `POST /api/deleted-records/restore` — restores a record (checks SalesInvoice unique constraint)

**Status:** ✅ Implemented (2026-04-28)

---

## 18. Document Type Auto-Detection & Wrong-Doc Blocking

Every upload page must classify documents before processing and block/warn on wrong types.

### Blocking Matrix

| Upload to | Invoice | Receipt | Bank Statement |
|-----------|---------|---------|----------------|
| **Invoices page** | ✅ accept | ⚠ warn | ❌ block (400) |
| **Claims page** | ⚠ warn | ✅ accept | ❌ block (400) |
| **Bank Recon page** | ❌ block (400) | ❌ block (400) | ✅ accept |

### Server-Side Classification
- `classifyPDF()` and `classifyImage()` in `lib/whatsapp/gemini.ts` — cheap 16-token Gemini call
- Runs BEFORE expensive extraction or parsing
- OCR endpoint: `getDocTypeBlockError()` in `app/api/ocr/extract/route.ts`
- Bank recon endpoints: `classifyPDF()` in both `app/api/bank-reconciliation/upload/route.ts` and admin version

### 4-Layer Doc Type Detection (Invoices page)
1. **Gemini AI** — firm name in prompt, returns `docType: PI|SI|CN|DN|PV|OR`
2. **Supplier cross-check** — vendor matches existing supplier → PI/CN; vendor matches firm → SI/DN
3. **Amount/keyword fallback** — negative amount → CN; "CREDIT NOTE:" → CN; "DEBIT NOTE:" → DN
4. **Default** → PI

### Upload Paths (14 total across 6 files)
| File | Paths | Context |
|------|-------|---------|
| `InvoicesPageContent.tsx` | 4 | none |
| `ClaimsPageContent.tsx` | 4 | `"claim"` |
| `employee/dashboard/page.tsx` | 2 | `"claim"` |
| `employee/claims/page.tsx` | 2 | `"claim"` |
| `bank-reconciliation/upload` | 1 | server |
| `admin/bank-reconciliation/upload` | 1 | server |

All must check `!res.ok` before `res.json()`.

### Schema
- `Invoice.doc_subtype`: `null` (PI/PV) or `'credit_note'` (CN)
- `SalesInvoice.doc_subtype`: `null` (SI/OR) or `'debit_note'` (DN)

**Status:** ✅ Implemented (2026-04-28)
