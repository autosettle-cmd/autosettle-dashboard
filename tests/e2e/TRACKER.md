# E2E Test Tracker

Last updated: 2026-04-28

## Test Suites

| Suite | Tests | Last Run | Result | Notes |
|-------|-------|----------|--------|-------|
| Page Titles | 32 | 2026-04-28 | 31/32 PASS | 1 flaky (admin aging — connection blip) |
| Data Flow | 29 | 2026-04-28 | 28/29 PASS | 1 flaky (admin invoices slow load) — selectors updated |
| Round-Trip | 7 | 2026-04-28 | 7/7 PASS | GL passthrough, soft delete, blockers, JV integrity |
| Lifecycle | 9 | 2026-04-28 | 9/9 PASS | Fixed selectors — all passing |

| Destructive Path | 13 | 2026-04-28 | 10/10 PASS | Delete blockers, validation, blocker detail, dedup, empty submit |
| Permissions | 10 | 2026-04-28 | 10/10 PASS | Role enforcement, firm scoping, page redirects |
| Lifecycle API | 4 | 2026-04-28 | 4/4 PASS | Invoice/claim approve+revert, soft delete cycle, bank recon match+unmatch |

## Recent Runs

### 2026-04-28 — Full Suite Run (All Tests)
- **Suite:** All (page-titles + data-flow + round-trip + data-lifecycle + destructive-path + permissions + lifecycle-api)
- **Result:** 100 passed, 0 failed, 1 flaky (7.7min)
- **Flaky:** Admin bank-reconciliation page title — `net::ERR_CONNECTION_RESET` on first attempt, passed on retry
- **Breakdown:**
  - Page Titles: 32 tests (1 flaky retry)
  - Data Flow: 29 passed
  - Data Lifecycle: 9 passed
  - Destructive Path: 10 passed
  - Permissions: 10 passed
  - Lifecycle API: 4 passed
  - Round-Trip: 7 passed

### 2026-04-28 — Page Titles (Smoke)
- **Suite:** page-titles.spec.ts
- **Result:** 31 passed, 0 failed, 1 flaky (3.1min)
- **Coverage:** 19 accountant pages + 13 admin pages — all load with correct title

### 2026-04-28 — Data Flow Tests (fixed)
- **Suite:** data-flow.spec.ts
- **Result:** 28 passed, 0 failed, 1 flaky (2.3min)
- **Fixed:** Updated all selectors for post-redesign UI (date inputs, table waits, card-button)
- **Added:** Section 12 — Deleted Items pages for accountant + admin



### 2026-04-28 — Round-Trip Tests
- **Suite:** round-trip.spec.ts
- **Result:** 7 passed, 0 failed (24.5s)
- **Tests:**
  - OR GL Passthrough — PASS
  - PV GL Passthrough — PASS
  - Soft Delete & Restore — PASS
  - Delete Blockers — PASS
  - JV Integrity (DR=CR) — PASS
  - Orphan JV Check — PASS
  - API Parity — PASS

## TODO: Tests to Add

### User Journey Tests (scripted click-through)
- [ ] Invoice lifecycle: upload → OCR → review → edit supplier → approve → JV → bank recon match → confirm → paid → unmatch → revert
- [ ] Claim lifecycle: submit → review → approve → bank recon match → confirm → paid
- [ ] Sales invoice lifecycle: create OR → approve → bank recon match → confirm
- [ ] Mileage claim lifecycle: submit → review → approve

### Destructive Path Tests (API-level)
- [x] Double-submit same invoice → dedup check blocks (destructive-path.spec.ts — Destructive 3)
- [ ] Delete claim with payments → blocker returned
- [ ] Delete invoice with bank match → blocker returned
- [x] Delete payment with allocations → blocker returned (destructive-path.spec.ts — Destructive 3)
- [x] Submit empty claim form → validation error (destructive-path.spec.ts — Destructive 3)

### Permission Matrix Tests (API-level)
- [ ] Admin cannot access other firm's data
- [ ] Employee cannot see other employee's claims
- [ ] Accountant firm scoping works (firmIds filter)
- [ ] Platform owner sees all firms

### Visual Snapshot Tests (future)
- [x] Invoice preview panel layout (data-flow.spec.ts — invoice-preview-modal.png)
- [x] Receipt preview panel layout (data-flow.spec.ts — receipt-preview-modal.png)
- [ ] Bank recon match modal layout
- [ ] Delete blocker modal layout
- [ ] Deleted Items page layout
