# Autosettle — Master Context

## How To Start a Session
Read this file and all files in /docs/ before doing anything.
Then fetch these two Notion pages for current build status:
- Dashboard Build: https://www.notion.so/3329e5f5baeb819fa4bbde374726c16f
- Next Session: https://www.notion.so/3329e5f5baeb812d9d93d706f5b9325e

Tell me the current status and what's next, then we begin.

---

## What Is Autosettle
Autosettle is a Malaysian B2B2C SaaS platform for accounting firms and their SME clients. Clients submit receipts, invoices, and expense claims via WhatsApp. AI extracts and categorises the data. Accountants review and approve via this web dashboard. Employees track their own submissions.

## Stack
- Framework: Next.js 14 (App Router)
- Styling: Tailwind CSS
- Database: PostgreSQL (self-hosted on VPS)
- ORM: Prisma
- Auth: NextAuth.js (email + password, credentials provider)
- Table component: AG Grid Community (free)
- Deployment: Vercel (frontend) + VPS (Postgres + WhatsApp backend)

## Three User Roles

### Accountant
- Manages multiple firms (accountant with zero firm assignments = sees all firms)
- Sees ALL data across assigned firms
- Can approve and reject claims and receipts (batch and individual)
- Can manage firms, employees, and categories
- After login → redirect to /accountant/dashboard

### Admin
- One or more per SME firm
- Sees only their own firm's data
- Can mark claims as Reviewed
- Can manage their own employees
- After login → redirect to /admin/dashboard

### Employee
- Individual staff under a firm
- Sees only their own submissions
- Can submit claims via dashboard or WhatsApp
- Read-only on approval status
- After login → redirect to /employee/dashboard

## Auth Rules
- Email + password only. No Google OAuth.
- Role stored in users table, read on login, stored in NextAuth session
- Role-based middleware: /accountant/* requires role=accountant, /admin/* requires role=admin, /employee/* requires role=employee
- Wrong role accessing wrong route → redirect to their correct dashboard
- Unauthenticated → redirect to /login

## Database
Postgres on VPS. Prisma as ORM. Schema in /prisma/schema.prisma.
Never query the database directly from frontend components.
All DB access goes through /app/api/* route handlers only.

## API Route Rules
- ALL database calls go through Next.js /app/api/* routes
- Frontend fetches from these routes, never touches Prisma directly
- Always return consistent JSON shape: { data, error, meta }

## Engineering Rules — Never Violate These
1. Never send a base64 image to an AI model more than once per document
2. Classify documents from OCR text first — escalate to AI only if confidence is low
3. Never expose database credentials or API keys client-side
4. All WhatsApp message bodies: no bold (**) or italic (*) formatting
5. Batch DB operations: use Promise.all() for parallel, chunk at 20 if >50 records
6. Always handle loading, error, and empty states in every UI component

## Design System
- Sidebar/header background: #152237 (dark navy)
- Content area: white
- Accent/buttons: #A60201 (Autosettle red)
- Success: #22C55E (green)
- Warning: #EAB308 (yellow)
- Danger: #EF4444 (red)
- Text primary: #1E293B
- Text muted: #94A3B8
- Font: Inter (Google Fonts)
- Status badges: Pending review=yellow, Reviewed=blue, Approved=green, Not approved=red, Paid=purple

## Project Structure

### Pages
/app/admin — Admin portal: Dashboard, Claims, Invoices, Suppliers, Employees, Categories
/app/accountant — Accountant portal: Dashboard, Claims, Invoices, Suppliers, Clients, Employees, Categories
/app/employee — Employee portal: Dashboard, My Claims
/app/login — Login page

### API Routes
/app/api/admin/* — Admin-scoped APIs (single firm)
/app/api/* (claims, invoices, payments, suppliers, etc.) — Accountant-scoped APIs (multi-firm)
/app/api/employee/* — Employee-scoped APIs (own data only)
/app/api/accountant/admins — Accountant admin management API
/app/api/whatsapp — WhatsApp + OCR backend
/app/api/payments/apply-credit — Supplier credit allocation
/app/api/receipts/unlinked — Available receipts for payment linking

### Key Directories
/lib — Shared utilities (db, auth, whatsapp, payment-utils)
/lib/whatsapp — WhatsApp backend (claims, invoices, ocr, gemini, parser, send, session, drive)
/lib/payment-utils.ts — recalcInvoicePayment() for payment status updates
/prisma — Schema + migrations (11 migrations as of 2026-04-01)
/docs — Spec files

### UI Patterns
- NAV is duplicated per page file (not shared component)
- Preview panels: 400px slide-in from right, dark header #152237
- All entity references clickable → preview panel (never redirect to filtered table)
- Edit mode in preview: inline fields with Save/Cancel, resets status on save
- Statement opens in new tab

## Docs To Read Before Building Any Feature
- /docs/database-schema.md — full Postgres schema
- /docs/user-roles.md — access control rules per role
- /docs/accountant-portal.md — accountant dashboard spec
- /docs/design-system.md — colors, fonts, components
- /docs/auth.md — authentication spec
- /docs/categories-spec.md — category business rules
- /docs/signup-spec.md — user onboarding flow
- /docs/whatsapp-backend.md — WhatsApp and OCR backend spec