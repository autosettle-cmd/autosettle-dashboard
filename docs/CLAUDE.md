# Autosettle Guidelines

Read this file before doing anything. These are the rules for building and maintaining Autosettle.

---

## What Is Autosettle

Malaysian B2B2C SaaS for accounting firms. Clients submit receipts, invoices, and expense claims via WhatsApp. AI extracts and categorizes. Accountants review and approve via web dashboard.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma 7, PostgreSQL, NextAuth.js

---

## Role Permissions

| Role | Scope | Can Do | JV Created? |
|------|-------|--------|-------------|
| **Accountant** | Assigned firms (`AccountantFirm` table). `null` = ALL firms. | Approve/reject, manage GL, COA import, all reports | **Yes** on approval |
| **Admin** | Single firm (`firm_id` on user) | Review only (not approve), manage employees, view reports | **No** |
| **Employee** | Own records only | Submit claims, view own status (reviewed, approved, payment) | N/A |

### Critical Rule: firmIds = null

`getAccountantFirmIds()` returns `null` for accountants with zero firm assignments = sees ALL firms.

**Never use `firmIds ?? []`** — it converts null to empty array, returning zero results.

```typescript
// CORRECT pattern
const firmScope = firmIds === null
  ? {}  // no filter = all firms
  : { firm_id: { in: firmIds } };
```

---

## JV (Journal Entry) Rules

| Entity | When JV Created | Debit | Credit |
|--------|-----------------|-------|--------|
| **Claim** | Accountant approval | Expense GL | Staff Claims Payable |
| **Mileage** | Accountant approval | Expense GL | Staff Claims Payable |
| **Receipt** | Bank reconciliation | Expense GL | Bank account |
| **Invoice** | Accountant approval | Expense/Asset GL | Accounts Payable |

### Reversal Rules
- Revert/edit of approved item = auto-reverse JV
- Reversal date: try original posting date first, fallback to today
- Both original + reversal stay posted, linked via `reversed_by_id`
- Show warning if posting to closed period

### No Special Cases
**Approved = JV created. Always. No exceptions.**

Never create workflows that skip JV for approved records (migration, bulk upload, historical, admin tools). Keeps the system predictable and GL accurate.

### GL Prerequisites — Block Before Create
**Every action that posts a JV must validate GL accounts BEFORE creating records.** If GL is missing, block the action with a clear error listing exactly what's missing. Never silently skip JV creation.

| Action | GL Required | Resolution Order |
|--------|------------|-----------------|
| **Invoice approval** | Expense GL + Contra GL (Trade Payables) | User-selected → supplier default → firm default |
| **Sales invoice approval** | Revenue GL + Contra GL (Trade Receivables) | User-selected → invoice GL → firm default |
| **Payment voucher** (bank recon) | Bank GL + Expense GL | Bank account GL mapping + user-selected → category override → firm default |
| **Official receipt** (bank recon) | Bank GL + Income GL | Bank account GL mapping + user-selected → category override → firm default |
| **Bank recon match/confirm** | Bank GL + Payables/Receivables GL | Bank account GL mapping + supplier/firm defaults |

**Error message format:** Tell the user exactly what's missing and where to fix it.
Example: `Bank account "CIMB 123456" has no GL account mapped. Go to Bank Recon → Manage Accounts and assign a GL.`

### JV Double-Confirm Rule
**Every button that creates OR reverses a Journal Entry must show a confirmation modal before executing.** No direct action — user must see what will happen and explicitly confirm.

| Action | Modal Shows | Confirm Button |
|--------|------------|----------------|
| **Invoice approval** | JV preview (DR Expense / CR Trade Payables) with amounts | "Confirm & Post JV" (green) |
| **Invoice revert approval** | List of what gets reversed (JV reversal, GL accounts, status reset) | "Confirm Revert" (red) |
| **Bank recon match/confirm** | JV preview (per-item DR lines + Bank CR) with partial match warning | "Confirm & Post JV" (green) |
| **Bank recon unmatch** | List of what gets reversed (JV, invoice payment status, claim status) | "Confirm Unmatch" (red) |
| **Payment voucher creation** | JV preview (DR Expense / CR Bank) | "Confirm & Post JV" (green) |
| **Official receipt creation** | JV preview (DR Bank / CR Income) | "Confirm & Post JV" (green) |

**Modal anatomy:** Colored header (green for create, red for reverse) → entity summary card → DR/CR table or reversal list → confirm + cancel buttons in `bg-[var(--surface-low)]` footer.

---

## Delete & Revert Rules

### Delete
- **Blocked** if entity has downstream links (receipts, payments, bank recon)
- Only allowed if entity has NO downstream references

### Revert
- **Always allowed** by both admin and accountant
- **Cascades backward** — undoes all downstream effects
- **Shows warning** with list of affected records before user confirms
- Admin can revert approved items (accountant re-approves after)

### Cascade Flow (revert undoes in reverse order)
```
Claim/Receipt submitted
    ↓ Admin reviews
Claim/Receipt reviewed
    ↓ Accountant approves (JV created for claims/mileage)
Claim/Receipt approved
    ↓ Used for:
    ├── Auto-match to pay invoice
    └── Bank recon to verify transaction (JV created for receipts)
```

### Soft Delete
Suppliers, Employees, GL Accounts = set `is_active = false`, never hard delete if referenced.

---

## UI/UX Standards

See **[`/docs/design.md`](/docs/design.md)** for the full design system spec (The Precision Ledger).

Key rules that must always be followed:
- **No hardcoded colors** — ALWAYS use CSS variables (`var(--primary)`, `var(--reject-red)`, `var(--text-primary)`, etc.) or Tailwind aliases (`text-primary`, `bg-surface-base`). All colors flow from `config/branding.ts`
- **No AG Grid** — use HTML `ds-table-header` + `useTableSort` hook
- **Modals** — centered only, no slide-in panels
- **Previews** — click entity = centered modal preview
- **Dropdowns** — must be searchable (type to filter) AND scrollable
- **Error Feedback** — pulse/highlight the button or field user needs to interact with, don't just show error text

---

## Development Workflow

### Multi-Role Parity
When implementing any feature, apply to ALL relevant roles (admin, accountant) automatically. Don't wait for instruction. Future roles should follow same pattern.

### Explain Changes
After making changes, explain what was done so the structure is understood.

### Other Rules
| Rule | Description |
|------|-------------|
| **Milestone confirmation** | Wait for confirmation before moving to next step |
| **No dead code** | Delete unused features entirely, don't hide nav links |
| **No hardcoded fixes** | Don't hardcode patterns for parsing issues, use structural/AI solutions |
| **Every user = Employee** | All users get Employee record, role is just permissions |

---

## Accounting Standards (Implemented)

- **Audit trail** — Log who changed what, when (`AuditLog` table)
- **Document numbering** — Auto-increment JV/invoice numbers per firm per year
- **Period lock** — Prevent changes to closed periods, warning before posting
- **Double-entry validation** — Every JV must balance (debits = credits)
- **Bank reconciliation** — Auto-match and manual match with reports

---

## Docs Reference

| File | Contents |
|------|----------|
| `/docs/user-roles.md` | Detailed role permissions, firm scoping, status flows |
| `/docs/database-schema.md` | Full Postgres schema + join tables + amount_paid formulas |
| `/docs/entity-cascade.md` | **Hard guardrails:** delete blockers, revert cascades, soft-delete rules |
| `/docs/jv-rules.md` | **Hard guardrails:** JV source types, GL resolution, reversal mechanics |
| `/docs/invoice-gl-flow.md` | **Full GL flow:** purchase + sales invoices — OCR → supplier match → GL auto-suggest → approval → supplier learns |
| `/docs/auto-suggest-flow.md` | **Auto-suggestion engine:** supplier matching, GL auto-suggest, bank recon auto-match — 4-pass matching, forced review, learning loop |
| `/docs/auth.md` | NextAuth login flow, middleware |
| `/docs/categories-spec.md` | Category business rules |
| `/docs/signup-spec.md` | User onboarding flow |
| `/docs/whatsapp-backend.md` | WhatsApp + OCR pipeline |
