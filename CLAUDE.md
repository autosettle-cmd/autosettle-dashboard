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
| `/docs/user-roles.md` | Role permissions, firm scoping, status flows |
| `/docs/database-schema.md` | Full Postgres schema + join tables + amount_paid formulas |
| `/docs/entity-cascade.md` | **Guardrails:** delete blockers, revert cascades, soft-delete rules |
| `/docs/jv-rules.md` | **Guardrails:** JV source types, GL resolution, reversal mechanics |
| `/docs/invoice-gl-flow.md` | **Full GL flow:** purchase + sales invoices — OCR → supplier match → GL auto-suggest → approval → supplier learns |
| `/docs/auto-suggest-flow.md` | **Auto-suggestion engine:** supplier matching, GL auto-suggest, bank recon auto-match |
| `/docs/auth.md` | Login flow, middleware |
| `/docs/whatsapp-backend.md` | WhatsApp + OCR pipeline |
