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

### Design System
- **Name:** Editorial Financial Intelligence
- **Principle:** Tonal layering, no 1px borders for sectioning
- **Colors:** Use CSS vars from `config/branding.ts` — never hardcode

### Components
| Pattern | Rule |
|---------|------|
| **Tables** | HTML `ds-table-header` + `useTableSort` hook. **No AG Grid.** |
| **Modals** | Centered only. **No slide-in panels.** |
| **Previews** | Click entity = centered modal preview |
| **Dropdowns** | Must be searchable (type to filter) AND scrollable |

### Button Colors
| Action | Color | Class |
|--------|-------|-------|
| Approve, confirm, proceed | Green | `btn-approve` |
| Submit, create | Blue | `btn-primary` |
| Delete, reject, danger | Red | `btn-reject` |

### Error Feedback
- Pulse/highlight the button or field user needs to interact with
- Don't just show error text — visually point to the fix
- Example: Upload without firm selected = pulse red on firm dropdown

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
| `/docs/user-roles.md` | Detailed role permissions and flows |
| `/docs/database-schema.md` | Full Postgres schema reference |
| `/docs/auth.md` | NextAuth login flow, middleware |
| `/docs/categories-spec.md` | Category business rules |
| `/docs/signup-spec.md` | User onboarding flow |
| `/docs/whatsapp-backend.md` | WhatsApp + OCR pipeline |
