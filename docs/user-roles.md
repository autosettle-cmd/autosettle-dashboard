# Autosettle User Roles & Access Control

## The Four Roles

### Accountant
- Assigned firms via `AccountantFirm` table (zero assignments = sees ALL firms)
- Multi-firm access — can switch between firms via sidebar selector
- Can approve/reject claims, receipts, invoices, sales invoices
- Approval creates Journal Entry (JV)
- Can manage: GL accounts, COA, fiscal periods, suppliers, categories, bank recon
- Can create firms and assign admins
- Uploads auto-skip `pending_review` → go straight to `reviewed` status
- After login: redirect to `/accountant/dashboard`

### Admin
- One firm only (`firm_id` on user record, must be set)
- Can mark claims/receipts as **Reviewed** (not approve)
- Review does NOT create JV
- Can approve/reject all same entities as accountant (within own firm)
- Can manage employees (create, approve, reject)
- Can create additional admins for own firm
- After login: redirect to `/admin/dashboard`

### Employee
- Individual staff under a firm
- Sees only own submissions (filtered by `employee_id`)
- Can submit claims, mileage claims via portal or WhatsApp
- Can view: reviewed status, approved status, payment status
- After login: redirect to `/employee/dashboard`

### Platform Owner
- Super-admin across ALL firms (no firm scoping)
- Can view all firms, users, platform analytics
- Can create firms with COA seeding, fiscal year setup, accountant assignment
- After login: redirect to `/platform/dashboard`

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

Use the `firmScope()` helper in `lib/accountant-firms.ts`. It also handles `selectedFirmId` validation — checks the firm is in the allowed list before scoping, returns `__blocked__` if not.

**30-second TTL cache** on `getAccountantFirmIds()` per request cycle.

---

## Firm Scoping Pattern

Every API route must enforce firm scoping. The pattern differs by role:

### Accountant Routes
```typescript
const firmIds = await getAccountantFirmIds(session.user.id);
const scope = firmScope(firmIds, requestedFirmId);
// scope is {} for super-admin, { firm_id: x } for specific firm
```

### Admin Routes
```typescript
const firmId = session.user.firm_id;  // always single firm
// All queries use { firm_id: firmId }
```

### Employee Routes
```typescript
const employeeId = session.user.employee_id;
// All queries use { employee_id: employeeId }
```

**Failure to validate = authorization bypass.** Every query touching firm data must include the scope.

---

## Full Permission Matrix

### Entity Operations

| Feature | Accountant | Admin | Employee | Platform Owner |
|---------|-----------|-------|----------|---------------|
| **Claims** | CRUD (multi-firm) | CRUD (single firm) | Create + read own | — |
| **Invoices** | CRUD (multi-firm) | CRUD (single firm) | — | — |
| **Sales Invoices** | CRUD (multi-firm) | CRUD (single firm) | — | — |
| **Bank Recon** | Full (multi-firm) | Full (single firm) | — | — |
| **Suppliers** | CRUD (multi-firm) | Read only | — | — |
| **Employees** | Read (multi-firm) | CRUD + approve/reject | — | — |
| **GL Accounts** | CRUD (multi-firm) | Read only | — | — |
| **Journal Entries** | CRUD + reverse (multi-firm) | Read only | — | — |
| **Categories** | CRUD (multi-firm) | Read only | Read (for submission) | — |
| **Fiscal Years** | CRUD (multi-firm) | CRUD (single firm) | — | — |
| **Firms** | Create + read assigned | Read own only | — | CRUD all |
| **Admins** | Create (in assigned firms) | Create (in own firm) | — | — |
| **Audit Logs** | Read (multi-firm) | Read (single firm) | — | — |
| **General Ledger** | Read (multi-firm) | Read (single firm) | — | — |

### Key Differences: Admin vs Accountant

| Capability | Accountant | Admin |
|-----------|-----------|-------|
| Firm scope | Multi-firm (or all if null) | Single firm only |
| Claim upload status | Auto-set to `reviewed` | Set to `pending_review` |
| Approve claims/invoices | Yes (creates JV) | Yes (same permissions) |
| Create suppliers | Yes | No dedicated endpoint |
| Manage GL accounts | Create, edit, delete | View only |
| Create journal entries | Yes | View only |
| Create firms | Yes | No |
| Manage employees | View only | Full CRUD + approve/reject |

---

## Status Flow

### Claims/Receipts (Two-Field System)

Claims use two separate fields: `status` (review) and `approval` (accountant decision).

```
Employee/WhatsApp submits
    ↓
status: pending_review, approval: pending_approval
    ↓ Admin reviews (or accountant upload auto-reviews)
status: reviewed
    ↓ Accountant approves
approval: approved → JV created (claims/mileage only)
    ↓ Payment via bank recon
payment_status: paid → bank_recon JV created (receipts)
```

### Invoices

```
Upload (OCR extracts data)
    ↓
approval: pending_approval
    ↓ Accountant approves (GL + contra required)
approval: approved → invoice_posting JV created
    ↓ Payment via bank recon or receipt linking
payment_status: paid
```

### Bank Transactions

```
Statement uploaded (CSV parsed)
    ↓
recon_status: unmatched
    ↓ Auto-match or manual match
recon_status: matched / manually_matched → bank_recon JV created
    ↓ Can be unmatched
recon_status: unmatched (JV reversed)
```

---

## Who Creates Who

```
Platform Owner / Jeff (seed)
  └── Creates accountant accounts

Accountant
  ├── Creates firms
  └── Creates first admin for each firm

Admin
  ├── Creates additional admins for own firm
  └── Approves pending employee signups

Employee
  └── Self-signup via /signup
  └── Needs admin approval before login
```

**Every user = Employee record.** All users get an Employee record on creation. Role is just permissions. Receipts auto-assign the uploader's employee record.

---

## Authentication Rules

- **JWT strategy** via NextAuth
- Credentials provider (email + password)
- Password: bcryptjs hashed (10 rounds), minimum 8 characters
- User must have `status: 'active'` AND `is_active: true` to login
- Session carries: `id`, `email`, `name`, `role`, `firm_id`, `employee_id`

### Route Protection (middleware.ts)

```
/accountant/* → requires role = accountant
/admin/*      → requires role = admin
/employee/*   → requires role = employee
/platform/*   → requires role = platform_owner
/api/whatsapp/* → public (webhook)
/login, /signup, / → public
```

Wrong role = redirect to their correct dashboard.
Unauthenticated = redirect to `/login`.

---

## JV Creation Rules

See **[`/docs/jv-rules.md`](/docs/jv-rules.md)** for comprehensive JV documentation.

Quick reference:

| Entity | Who Approves | JV Created | source_type |
|--------|--------------|------------|-------------|
| Claim/Mileage | Accountant | At bank recon (not on approval) | `bank_recon` |
| Receipt | Accountant | At bank recon | `bank_recon` |
| Invoice | Accountant | On approval | `invoice_posting` |
| Sales Invoice | Accountant | On approval | `sales_invoice_posting` |

**Admin review = status change only, no JV.**

---

## Delete & Revert Rules

See **[`/docs/entity-cascade.md`](/docs/entity-cascade.md)** for comprehensive cascade documentation.

Quick reference:
- **Delete** blocked if entity has downstream links
- **Revert** always allowed, cascades backward, shows warning first
- **Admin can revert** approved items — accountant re-approves after
- **JVs are never deleted** — only reversed

---

## Duplicate Detection

| Entity | Check | When |
|--------|-------|------|
| Claim | File SHA256 hash + merchant+amount+date+employee | On file drop (before OCR) |
| Mileage | merchant+distance+from+to+date | On submission |
| Invoice | File hash + invoice_number per firm | On file drop (before OCR) |
| Bank Statement | File hash | On upload |
