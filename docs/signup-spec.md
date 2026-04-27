# signup-spec.md — User Onboarding Flow

## Purpose

Defines the full signup and onboarding flow for all four roles. Updated 2026-04-27.

---

## Who Creates Who

```
Accountant
  └── Self-signup via /signup/accountant
      → enters firm name + personal details
      → receives 6-digit email verification code
      → on verification: user + firm activated, AccountantFirm linked
      → logs in → completes onboarding wizard (COA, fiscal year, firm details)
  └── Creates first admin for each client firm (from Clients tab)

Admin
  ├── Created by accountant (from Clients → firm detail → Add Admin)
  ├── Creates additional admins for their own firm
  └── Approves pending employee signups for their firm

Employee
  └── Self-signup via /signup
      → selects existing firm from dropdown
      → status = pending_onboarding
      → admin approves before employee can log in

Platform Owner (Jeff)
  └── Seeded manually
  └── Can deactivate any firm/user from /platform portal
```

---

## 1. Accountant Self-Signup

### Page: `/signup/accountant`

**Fields:**
- Firm name (required)
- Firm address (optional)
- Full name (required)
- Email address (required)
- Phone number (required)
- Password (required, min 8 characters)
- Confirm password (required)

**On submit → `POST /api/auth/signup-accountant`:**
1. Validate all fields, check email + phone uniqueness
2. In a single transaction:
   - Create Firm (`is_active: false`)
   - Create Employee record
   - Create User (`role: accountant`, `status: pending_onboarding`, `is_active: false`)
   - Store hashed 6-digit verification code (expires in 15 minutes)
3. Send verification code to email via Google Workspace SMTP (`lib/email.ts`)
4. Show "Enter verification code" screen

**Verification → `POST /api/auth/verify-email`:**
1. User enters 6-digit code
2. Validates code against hashed value, checks expiry
3. On valid:
   - `user.status` → `active`, `user.is_active` → `true`
   - `firm.is_active` → `true`
   - Creates `AccountantFirm` join record
   - COA and fiscal year are NOT seeded — accountant sets these up via onboarding wizard after first login
4. Shows success screen with "Sign in" button

**Resend code:**
- Rate limited to 1 per 60 seconds
- Generates new code, invalidates old one

**Files:**
- `app/signup/accountant/page.tsx` — signup form + verification code entry
- `app/api/auth/signup-accountant/route.ts` — creates firm + employee + user
- `app/api/auth/verify-email/route.ts` — validates code, activates account
- `lib/email.ts` — Nodemailer transporter (Google Workspace SMTP)

---

## 2. Employee Self-Signup

### Page: `/signup`

**Fields:**
- Full name (required)
- Email address (required)
- Phone number (required) — links to WhatsApp submissions
- Password (required, min 8 characters)
- Confirm password (required)
- Firm selection (required) — searchable dropdown of active firms

**On submit → `POST /api/auth/signup`:**
1. Validate all fields
2. Check if phone already exists in Employee table
   - If YES: link User to existing Employee record
   - If NO: create new Employee record
3. Create User (`role: employee`, `status: pending_onboarding`)
4. Show success: "Please wait for your admin to approve your access."

**On login attempt while pending:**
- Auth check in `lib/auth.ts` blocks users where `status !== 'active'`
- Returns generic login error

**Files:**
- `app/signup/page.tsx` — employee signup form
- `app/api/auth/signup/route.ts` — creates employee + user

---

## 3. Admin Creation (by Accountant)

### Location: Accountant portal → Clients → firm detail page

**Add Admin modal fields:**
- Full name (required)
- Email address (required)
- Phone number (optional)
- Temporary password (required)

**On submit → `POST /api/admin/admins`:**
- Creates Employee record (or links existing by phone)
- Creates User (`role: admin`, `status: active`) — immediately active
- Admin can log in right away with the temporary password

---

## 4. Admin Creates Another Admin

### Location: Admin portal → Employees tab → Admins section

- Same modal and API as accountant's Add Admin
- Admin can only create admins for their OWN firm
- Created via `POST /api/admin/admins`

---

## 5. Approve Employee Signup (Admin or Accountant)

### Location: Admin portal → Employees tab, OR Accountant portal → Employees tab

Both admin and accountant can approve pending employee signups:
- Shows employees with `status: pending_onboarding` for the firm (admin) or assigned firms (accountant)
- Approve → `PATCH /api/admin/employees/[id]/approve` → `status: active`
- Reject → sets `status: rejected`
- Section hidden when no pending employees
- API checks firm scoping: admin can only approve own firm, accountant can approve any assigned firm

---

## User Status Values

| Status | Meaning | Can log in? |
|--------|---------|-------------|
| `active` | Fully activated | Yes |
| `pending_onboarding` | Awaiting approval (employee) or email verification (accountant) | No |
| `rejected` | Admin rejected the signup | No |
| `inactive` | Manually deactivated | No |

---

## Database Fields

**User model:**
- `status` — `UserStatus` enum (active, pending_onboarding, rejected, inactive)
- `is_active` — boolean, checked alongside status in auth
- `verification_code` — hashed 6-digit code (nullable, for email verification)
- `verification_expires` — DateTime (nullable, 15-minute expiry)

**Auth check (`lib/auth.ts`):**
- Login requires `status === 'active'` AND `is_active === true`

---

## API Routes Summary

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/auth/signup` | Public | Employee self-signup |
| `POST /api/auth/signup-accountant` | Public | Accountant self-signup (creates firm) |
| `POST /api/auth/verify-email` | Public | Verify email code / resend code |
| `GET /api/firms/public` | Public | Active firms list for signup dropdown |
| `POST /api/admin/admins` | Admin/Accountant | Create admin for a firm |
| `PATCH /api/admin/employees/[id]/approve` | Admin | Approve pending employee |
| `PATCH /api/admin/employees/[id]/reject` | Admin | Reject pending employee |

---

## Env Vars Required

```
SMTP_USER=your-workspace-email@domain.com
SMTP_PASS=google-app-password
```

---

## Future (not built yet)

- Email notification to employee when approved
- Email notification to admin when new employee signs up
- "Set your password" email link for newly created admins
- Rate limiting on signup endpoints
- Billing / trial period for new accountant signups
