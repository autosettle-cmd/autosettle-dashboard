# Autosettle Guidelines

Read this file before doing anything. These are the rules for building and maintaining Autosettle.

---

## What Is Autosettle

Malaysian B2B2C SaaS for accounting firms. Clients submit receipts, invoices, and expense claims via WhatsApp. AI extracts and categorizes. Accountants review and approve via web dashboard.

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma 7, PostgreSQL, NextAuth.js

---

## Non-Negotiable Rules

These apply everywhere. Full details in the linked docs.

### 1. firmIds = null means ALL firms

`getAccountantFirmIds()` returns `null` for accountants with zero firm assignments = sees ALL firms. **Never use `firmIds ?? []`** — it converts null to empty, returning zero results. See [`/docs/user-roles.md`](/docs/user-roles.md).

```typescript
const firmScope = firmIds === null
  ? {}  // no filter = all firms
  : { firm_id: { in: firmIds } };
```

### 2. JV timing

Invoice/Sales Invoice approval = JV created. **Claim/Mileage approval = NO JV** — JV only at bank recon. See [`/docs/jv-rules.md`](/docs/jv-rules.md).

### 3. GL prerequisites block the action

Every action that posts a JV must validate GL accounts BEFORE creating records. If GL is missing, block with a clear error. Never silently skip JV. See [`/docs/jv-rules.md`](/docs/jv-rules.md).

### 4. JV double-confirm

Every button that creates or reverses a JV must show a confirmation modal with DR/CR preview. No direct action. See [`/docs/jv-rules.md`](/docs/jv-rules.md).

### 5. Delete/revert cascades

Delete is blocked if downstream links exist. Revert always cascades backward and shows warning. See [`/docs/entity-cascade.md`](/docs/entity-cascade.md).

### 6. UI rules

No hardcoded colors (use CSS vars from `config/branding.ts`). No AG Grid. Centered modals only. Searchable dropdowns. See [`/docs/design.md`](/docs/design.md).

---

## Development Workflow

| Rule | Description |
|------|-------------|
| **Multi-role parity** | Apply changes to admin + accountant together |
| **No dead code** | Delete unused features entirely, don't hide nav links |
| **No hardcoded fixes** | Use structural/AI solutions, not hardcoded patterns |
| **Every user = Employee** | All users get Employee record, role is just permissions |
| **Milestone confirmation** | Wait for confirmation before moving to next step |
| **Explain changes** | After making changes, explain what was done |
| **Batch API calls** | Multiple fetches for the same action must use a single `Promise.all` — never scatter across separate useEffects or sequential awaits. One batch, one render cycle, with cancellation cleanup. |
| **Reuse shared components** | Use existing preview panels, modals, and form components. Never duplicate UI code inline — if a shared component is missing a feature, add it to the shared component. |

---

## Docs Reference

| File | Contents |
|------|----------|
| [`/docs/user-roles.md`](/docs/user-roles.md) | Role permissions, firm scoping, status flows |
| [`/docs/database-schema.md`](/docs/database-schema.md) | Full Postgres schema + join tables + amount_paid formulas |
| [`/docs/entity-cascade.md`](/docs/entity-cascade.md) | Delete blockers, revert cascades, payment allocation engine |
| [`/docs/jv-rules.md`](/docs/jv-rules.md) | JV source types, GL resolution, reversal mechanics, fiscal periods |
| [`/docs/invoice-gl-flow.md`](/docs/invoice-gl-flow.md) | Purchase + sales invoices — OCR → supplier match → GL auto-suggest → approval → supplier learns |
| [`/docs/auto-suggest-flow.md`](/docs/auto-suggest-flow.md) | Supplier matching, GL auto-suggest, bank recon auto-match, bank parsing, dedup detection |
| [`/docs/gl-reports.md`](/docs/gl-reports.md) | General Ledger, Trial Balance, P&L, Balance Sheet |
| [`/docs/auth.md`](/docs/auth.md) | NextAuth login flow, middleware |
| [`/docs/whatsapp-backend.md`](/docs/whatsapp-backend.md) | WhatsApp + OCR pipeline |
| [`/docs/design.md`](/docs/design.md) | UI design system, component patterns, global search |
| [`/docs/platform-owner.md`](/docs/platform-owner.md) | Platform owner portal, analytics dashboard |
| [`/docs/signup-spec.md`](/docs/signup-spec.md) | Employee self-signup, admin creation |
| [`/docs/categories-spec.md`](/docs/categories-spec.md) | Category business rules |
| [`/docs/audit-checklist.md`](/docs/audit-checklist.md) | Patterns the `/audit` skill verifies — voucher prefixes, table stability, GL cache, totals, badges, layouts |
