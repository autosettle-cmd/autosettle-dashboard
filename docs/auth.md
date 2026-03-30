# Autosettle — Authentication Spec

## Auth Method
- Email + password only
- No Google OAuth (not building now)
- Provider: NextAuth.js CredentialsProvider
- Passwords hashed with bcrypt (never stored in plain text)

---

## Login Flow

1. User enters email + password at /login
2. NextAuth calls authorize() in lib/auth.ts
3. authorize() does:
   - Find user by email in users table
   - If not found → return null ("Invalid email or password")
   - Compare password with bcrypt.compare()
   - If wrong password → return null ("Invalid email or password")
   - Check user.status:
     - pending_onboarding → throw Error("Your account is pending approval.")
     - rejected → throw Error("Your account has been rejected.")
     - inactive → throw Error("Your account has been deactivated.")
     - active → continue
   - Return user object: { id, email, name, role, firmId, employeeId, status }
4. NextAuth stores returned object in JWT
5. Redirect based on role (see below)

---

## Post-Login Redirect By Role
- role = accountant → /accountant/dashboard
- role = admin → /admin/dashboard
- role = employee → /employee/dashboard
- Unknown role → /login (log error)

Implement in NextAuth callbacks.redirect() or in middleware.ts.

---

## Session Shape

NextAuth JWT and session both contain:
- id: string — users.id
- email: string
- name: string
- role: 'accountant' | 'admin' | 'employee'
- firmId: string | null — null for accountant
- employeeId: string | null — only for employee
- status: 'active' | 'pending_onboarding' | 'rejected' | 'inactive'

Set in NextAuth callbacks.jwt() and callbacks.session().
Always read role from session — never from the client or URL params.

---

## Middleware (middleware.ts)

Protected route map:
- /accountant/* → requires role = accountant
- /admin/* → requires role = admin
- /employee/* → requires role = employee

Logic:
1. If unauthenticated → redirect to /login
2. If authenticated but wrong role → redirect to correct dashboard
3. If authenticated and correct role → allow through

Public routes (no auth required):
- /login
- /signup
- /api/auth/*
- /api/firms/public
- /api/auth/signup

---

## Password Rules
- Minimum 8 characters
- Hashed with bcrypt, saltRounds = 10
- Password reset: not building now — Jeff sets passwords manually for accountant and admin accounts

---

## Employee Self-Signup (/signup)
- Public page — no auth required
- Creates user with status = pending_onboarding
- Cannot log in until admin sets status = active
- If login attempted while pending → show: "Your account is pending approval. Contact your admin."
- Full signup spec in /docs/signup-spec.md

---

## Account Creation Rules
- Accountant accounts: Jeff creates manually via TablePlus or prisma seed
- Admin accounts: created by accountant or another admin from portal UI
- Employee accounts: self-signup via /signup, OR admin creates manually from portal
- NO public account creation for accountant or admin roles

---

## API Route Auth Pattern

Every protected API route must start with:

const session = await getServerSession(authOptions)
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (session.user.role !== 'accountant') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

Always check both: authenticated AND correct role.
For multiple roles: ['accountant', 'admin'].includes(session.user.role)

---

## Response Shape for Auth Errors
- 401 Unauthorized: { error: 'Unauthorized' } — not logged in
- 403 Forbidden: { error: 'Forbidden' } — logged in but wrong role

---

## Files That Implement Auth
- /lib/auth.ts — NextAuth config, authorize() logic, JWT + session callbacks
- /middleware.ts — route protection and role-based redirects
- /app/api/auth/[...nextauth]/route.ts — NextAuth handler
- /app/login/page.tsx — login UI
- /app/signup/page.tsx — employee self-signup UI
- /app/api/auth/signup/route.ts — public signup endpoint

---

## Known Issue — Fix In Next Session
Login currently returns 401 error. Fix checklist:
1. Check /lib/auth.ts authorize() — must return full user object, not null, for valid credentials
2. Confirm NEXTAUTH_SECRET is set in .env
3. Confirm NEXTAUTH_URL is set in .env (e.g. http://localhost:3000)
4. Confirm database connection in lib/db.ts is working

---

## Future (not building now)
- Password reset via email
- "Set your password" email link for new admin accounts
- Email notification to employee when account approved
- Rate limiting on /api/auth/signup
- Google OAuth (secondary option for accountant only)