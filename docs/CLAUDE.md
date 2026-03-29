# Autosettle — Master Context

## What Is Autosettle
Autosettle is a Malaysian B2B2C SaaS platform for accounting firms and their SME clients. Clients submit receipts, invoices, and expense claims via WhatsApp. AI extracts and categorises the data. Accountants review and approve via this web dashboard. Employees track their own submissions.

## Stack
- Framework: Next.js 14 (App Router)
- Styling: Tailwind CSS
- Database: PostgreSQL (self-hosted on VPS)
- ORM: Prisma
- Auth: NextAuth.js (email + password, credentials provider)
- Table component: AG Grid Community (free)
- Deployment: Vercel (frontend) + VPS (Postgres + n8n)

## Three User Roles

### Accountant
- Manages multiple firms
- Sees ALL data across ALL firms
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
- Can submit claims and receipts via dashboard or WhatsApp
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
- Primary background: #0F172A (dark navy)
- Surface/cards: #1E293B
- Accent: #3B82F6 (blue)
- Success: #22C55E (green)
- Warning: #EAB308 (yellow)
- Danger: #EF4444 (red)
- Text primary: #F8FAFC
- Text muted: #94A3B8
- Font: Inter (Google Fonts)
- Status badges: Pending review=yellow, Reviewed=blue, Approved=green, Not approved=red, Paid=purple

## Project Structure
/app — Next.js App Router pages
/app/api — All backend API routes
/app/accountant — Accountant portal pages
/app/admin — Admin portal pages
/app/employee — Employee portal pages
/components — Shared UI components
/lib — Shared utilities (db, auth, whatsapp, helpers)
/prisma — Prisma schema and migrations
/docs — All spec files (read these before building any feature)
