# Autosettle User Roles & Access Control

## The Three Roles

### Accountant
- Assigned firms via `AccountantFirm` table (zero assignments = sees ALL firms)
- Can approve and reject claims, receipts, invoices
- Approval creates Journal Entry (JV)
- Can manage GL accounts, COA, fiscal periods
- Can manage all firms, employees, categories
- After login: redirect to `/accountant/dashboard`

### Admin
- One firm only (`firm_id` on user record)
- Can mark claims/receipts as **Reviewed** (not approve)
- Review does NOT create JV
- Can manage employees in own firm
- Can add/deactivate categories for own firm
- After login: redirect to `/admin/dashboard`

### Employee
- Individual staff under a firm
- Sees only own submissions
- Can view: reviewed status, approved status, payment status
- Submits via WhatsApp or employee portal
- After login: redirect to `/employee/dashboard`

---

## Critical: firmIds = null

`getAccountantFirmIds()` returns `null` when accountant has zero firm assignments.

**null means "see ALL firms", not "see none".**

```typescript
// WRONG - converts null to empty array, returns nothing
const filter = { firm_id: { in: firmIds ?? [] } };

// CORRECT
const firmScope = firmIds === null
  ? {}  // no filter
  : { firm_id: { in: firmIds } };
```

Use the `firmScope()` helper in `lib/accountant-firms.ts`.

---

## JV Creation Rules

| Entity | Who Approves | JV Created | Debit | Credit |
|--------|--------------|------------|-------|--------|
| Claim | Accountant | On approval | Expense GL | Staff Claims Payable |
| Mileage | Accountant | On approval | Expense GL | Staff Claims Payable |
| Receipt | Accountant | At bank recon | Expense GL | Bank Account |
| Invoice | Accountant | On approval | Expense GL | Accounts Payable |

**Admin review = status change only, no JV.**

### No Special Cases

**Approved = JV created. Always. No exceptions.**

Never create special modes, flags, or workflows that skip JV generation for approved records. This includes:
- Migration imports
- Bulk uploads
- Historical data
- God mode / admin tools

If a record is approved, it gets a JV. This keeps the system predictable and the GL accurate.

---

## Delete & Revert Rules

### Delete
Blocked if entity has downstream links. Only allowed if no references.

### Revert
- Always allowed by both admin and accountant
- Cascades backward (undoes all downstream effects)
- Shows warning with affected records before user confirms
- Admin can revert approved items — accountant re-approves after

### Cascade Behavior

When reverting, undo in reverse order:

| Action | What Gets Undone |
|--------|------------------|
| Admin reverts to "not reviewed" | Approval, JV, bank recon match, invoice payment |
| Accountant reverts to "pending approval" | JV reversed, bank recon unmatched, payment unlinked |
| Unmatch bank recon | Bank recon JV reversed, payment link removed |

---

## Status Flow

### Claims/Receipts

```
Employee submits
    ↓
status: pending_review, approval: pending_approval
    ↓ Admin reviews
status: reviewed
    ↓ Accountant approves (JV created)
approval: approved
    ↓ Payment recorded
payment_status: paid
```

### Admin Actions
- `pending_review` → `reviewed`

### Accountant Actions
- `pending_approval` → `approved` or `not_approved`
- `unpaid` → `paid`

---

## Table Access Matrix

| Table | Accountant | Admin | Employee |
|-------|------------|-------|----------|
| users | All | No | No |
| firms | All | Own only | No |
| employees | All | Own firm | No |
| categories | All | Own firm | No |
| claims | All | Own firm | Own only |
| invoices | All | Own firm | No |
| glAccounts | All | View only | No |
| journalEntries | All | View only | No |

---

## Role-Based Middleware

```
/accountant/* → requires role = accountant
/admin/* → requires role = admin
/employee/* → requires role = employee
```

Wrong role = redirect to their correct dashboard.
Unauthenticated = redirect to `/login`.

---

## Who Creates Who

```
Jeff (via seed/TablePlus)
  └── Creates accountant accounts

Accountant
  └── Creates first admin for each firm

Admin
  ├── Creates additional admins for own firm
  └── Approves pending employee signups

Employee
  └── Self-signup via /signup
  └── Needs admin approval before login
```
