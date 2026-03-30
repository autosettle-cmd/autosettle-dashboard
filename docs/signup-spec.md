# signup-spec.md — User Onboarding Flow

## Purpose

This spec defines the full user onboarding flow for all three roles. Load this into Claude Code before building the signup and user management features.

---

## Who Creates Who

```
Jeff (super admin)
  └── Creates accountant accounts manually (via TablePlus or seed script)

Accountant
  └── Creates first admin for each firm (from Clients tab)

Admin
  ├── Creates additional admins for their own firm only
  └── Approves pending employee signups for their firm

Employee
  └── Self-signup via /signup page
  └── Needs admin approval before can log in
```

---

## Employee Self-Signup Flow

### Page: /signup

Separate page from login. Login page has "Don't have an account? Sign up" link at bottom.

**Fields:**

- Full name (required)
- Email address (required)
- Phone number (required) — links to WhatsApp submissions
- Password (required, min 8 characters)
- Confirm password (required)
- Firm selection dropdown (required) — shows ALL active firms
    - Searchable/filterable — user can type to search and filter firm names
    - Helper text below dropdown: "Not sure which firm to choose? Contact your manager or admin for the correct firm name."

**On submit:**

1. Validate all fields
2. Check if phone number already exists in Employee table
    - If YES: link User account to existing Employee record (auto-link)
    - If NO: create new Employee record with submitted name + phone
3. Create User record with role=employee, status=pending_onboarding
4. Show success message: "Your account has been created. Please wait for your admin to approve your access. You will be notified once approved."
5. Do NOT redirect to dashboard — stay on success screen

**On login attempt while pending:**

- Show error: "Your account is pending approval. Please contact your admin to activate your account."
- Do not redirect anywhere

**Phone number uniqueness rule:**

- If phone already exists in Employee table → link automatically, no duplicate Employee record created
- If phone already exists in User table → show error "An account with this phone number already exists"

---

## Admin Approval Flow (in Admin Portal)

### Location: Admin portal → Employees tab

Employees tab has two sections:

**Section 1: Pending Approval**

- Shows all employees with status=pending_onboarding for this firm
- Badge: orange "Pending" indicator
- Columns: name, email, phone, date requested
- Actions per row:
    - Approve button → sets status=active, employee can now log in
    - Reject button → sets status=rejected, shows rejection reason input
- If no pending employees: hide this section entirely

**Section 2: Active Employees**

- All active employees (status=active)
- Same table as before: name, phone, email, claims count, active badge
- Deactivate/Activate toggle
- Add Employee button (manual add — admin creates employee directly without signup)

---

## Accountant Creates Admin Flow

### Location: Accountant portal → Clients tab → click into a firm

Firm detail page (new page at /accountant/clients/[firmId]) shows:

- Firm details (name, registration, contact)
- Admin users for this firm
- Button: "Add Admin"

**Add Admin modal fields:**

- Full name (required)
- Email address (required)
- Phone number (optional)
- Temporary password (required) — accountant sets this, tells admin manually
- Future: "Send set-password email" button (not built yet)

**On submit:**

- Create User record with role=admin, firm_id=this firm, status=active
- Admin can log in immediately with the temporary password

---

## Admin Creates Another Admin Flow

### Location: Admin portal → Employees tab

Separate section or tab: "Admins"

- Shows all admin users for this firm
- Button: "Add Admin"
- Same modal as accountant's Add Admin
- Admin can only add admins for their OWN firm
- Cannot create accountant accounts

---

## User Status Values

| Status | Meaning |
| --- | --- |
| active | Can log in and use the system |
| pending_onboarding | Self-signed up, waiting for admin approval |
| rejected | Admin rejected the signup request |
| inactive | Was active, manually deactivated by admin |

---

## Database Changes Needed

Add `status` field to User table if not already present:

```
status Enum [active, pending_onboarding, rejected, inactive] default active
```

Update auth check in lib/auth.ts:

- After finding user by email, check status
- If status = pending_onboarding → return null with message
- If status = rejected or inactive → return null with message
- Only status = active can log in

---

## Pages To Build

1. `/signup` — employee self-signup page
2. `/app/admin/employees/page.tsx` — update to show pending approval section
3. `/app/accountant/clients/[firmId]/page.tsx` — firm detail with Add Admin
4. `/app/admin/employees/page.tsx` — add Admins section with Add Admin

---

## API Routes Needed

- `POST /api/auth/signup` — create employee account (public, no auth required)
- `GET /api/admin/employees/pending` — pending employees for admin's firm
- `PATCH /api/admin/employees/[id]/approve` — approve employee
- `PATCH /api/admin/employees/[id]/reject` — reject employee
- `POST /api/accountant/admins` — accountant creates admin for a firm
- `POST /api/admin/admins` — admin creates another admin for their firm
- `GET /api/firms/public` — public list of firm names for signup dropdown (no auth)

---

## Security Notes

- `/api/auth/signup` and `/api/firms/public` are the only public routes (no auth)
- All other routes require authenticated session
- Admin can only approve/reject employees in their own firm
- Admin can only create admins for their own firm
- Accountant can create admins for any assigned firm
- Signup page should have rate limiting to prevent spam signups (future)

---

## Future (not building now)

- Email notification to employee when approved
- "Set your password" email link for newly created admins
- Email notification to admin when new employee signup pending
- Rate limiting on signup endpoint