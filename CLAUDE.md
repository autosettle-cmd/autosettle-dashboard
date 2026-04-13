# Autosettle

Read `/docs/CLAUDE.md` for full guidelines before doing anything.

## Quick Reference

**Stack:** Next.js 14, Prisma 7, PostgreSQL, NextAuth, Tailwind

**Roles:** Accountant (approve, JV), Admin (review only), Employee (submit, view)

**Key Rules:**
- `firmIds === null` means "see ALL firms", not empty
- JV created on: claim/mileage approval, receipt bank recon, invoice approval
- Revert cascades backward, shows affected records in warning
- UI: centered modals only, no AG Grid, searchable dropdowns
- Multi-role parity: apply changes to admin + accountant together

## Docs

| File | Contents |
|------|----------|
| `/docs/CLAUDE.md` | Full guidelines |
| `/docs/user-roles.md` | Role permissions, JV rules, cascade behavior |
| `/docs/database-schema.md` | Full Postgres schema |
| `/docs/auth.md` | Login flow, middleware |
| `/docs/whatsapp-backend.md` | WhatsApp + OCR pipeline |
