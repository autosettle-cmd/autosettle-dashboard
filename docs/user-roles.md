# Autosettle — User Roles & Access Control

## The Three Roles

### Accountant
- Managed by Jeff (created manually via TablePlus or seed script)
- Sees ALL data across ALL firms — no firm filter applied
- Can approve and reject claims and receipts (batch and individual)
- Can manage all firms, all employees, and all categories
- Can create admin accounts for any firm
- After login → redirect to /accountant/dashboard

### Admin
- One or more per SME firm
- Created by accountant OR by another admin in the same firm
- Sees ONLY their own firm's data — all queries filter by firm_id
- Can mark claims as Reviewed (first-pass review before accountant approves)
- Can manage employees in their own firm only
- Can add/deactivate firm-specific categories for their firm only
- Can create additional admin accounts for their own firm only
- After login → redirect to /admin/dashboard

### Employee
- Individual staff under a firm
- Self-signup via /signup page — requires admin approval before login works
- Sees ONLY their own submissions — all queries filter by user_id
- Can view their own claims and receipts (read only on approval status)
- Submits via WhatsApp or employee portal
- After login → redirect to /employee/dashboard

---

## Approval Flow
Employee submits → Admin reviews (sets status: reviewed) → Accountant approves or rejects (sets approval: approved / not_approved)

---

## Table Access Matrix

| Table             | Accountant      | Admin                  | Employee         |
|-------------------|-----------------|------------------------|------------------|
| users             | All             | No                     | No               |
| firms             | All             | Own firm only          | No               |
| employees         | All             | Own firm only          | No               |
| categories        | All             | Own firm only          | No               |
| receipts          | All             | Own firm only          | Own only         |
| invoices          | All             | Own firm only          | No               |
| claims            | All             | Own firm only          | Own only         |
| sessions          | No (n8n only)   | No (n8n only)          | No (n8n only)    |

---

## Filtering Rules Per Role

### Accountant
- No filter on any query — sees all records
- Full CRUD on all tables except sessions
- Can approve/reject → sets approval field to approved or not_approved

### Admin
- Every query filters by: WHERE firm_id = session.user.firmId
- Cannot see any other firm's data
- Can set status → reviewed (cannot set approved/not_approved)
- Can deactivate default categories for their own firm via CategoryFirmOverride
- Can add/edit firm-specific categories for their own firm only

### Employee
- Every query filters by: WHERE employee_id = session.user.employeeId
- Cannot see other employees' submissions
- Read-only on all records — no edit, no delete
- Can view: own claims, own receipts
- Cannot view: firms, employees, categories, invoices

---

## Status Flow (applies to Claims and Receipts)

Status field (admin controls):
  pending_review → reviewed

Approval field (accountant controls):
  pending_approval → approved OR not_approved

Payment status (accountant controls):
  unpaid → paid

Full flow:
  Employee submits
  → status: pending_review, approval: pending_approval
  → Admin reviews → status: reviewed
  → Accountant approves → approval: approved
  → Accountant marks paid → payment_status: paid

---

## Role-Based Middleware Rules
- /accountant/* → requires role = accountant
- /admin/* → requires role = admin
- /employee/* → requires role = employee
- Wrong role accessing wrong route → redirect to their correct dashboard
- Unauthenticated → redirect to /login
- Implemented in middleware.ts using NextAuth session

---

## Who Creates Who

Jeff (manually via TablePlus or seed script)
  └── Creates accountant accounts

Accountant
  └── Creates first admin for each firm (from Clients tab)

Admin
  ├── Creates additional admins for their own firm only
  └── Approves pending employee self-signups for their firm

Employee
  └── Self-signup via /signup
  └── Status set to pending_onboarding until admin approves
  └── Cannot log in until status = active

---

## User Status Values

| Status               | Meaning                                      |
|----------------------|----------------------------------------------|
| active               | Can log in and use the system                |
| pending_onboarding   | Self-signed up, waiting for admin approval   |
| rejected             | Admin rejected the signup request            |
| inactive             | Was active, manually deactivated by admin    |

---

## Open Questions (decide before building)
- Can employees see the Payment status of their claims?
- Can admin change Payment status, or only accountant?
- Will there ever be a Manager role separate from Accountant?