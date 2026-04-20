# Autosettle

Read `/docs/CLAUDE.md` for full guidelines before doing anything.

## Quick Reference

**Stack:** Next.js 14, Prisma 7, PostgreSQL, NextAuth, Tailwind

**Roles:** Accountant (approve, JV), Admin (review only), Employee (submit, view)

**Key Rules:**
- `firmIds === null` means "see ALL firms", not empty
- JV created on: invoice approval, sales invoice approval, bank recon (invoices + claims + receipts)
- Revert cascades backward, shows affected records in warning
- UI: centered modals only, no AG Grid, searchable dropdowns
- Multi-role parity: apply changes to admin + accountant together

## Docs

| File | Contents |
|------|----------|
| `/docs/CLAUDE.md` | Non-negotiable rules (slim — references other docs) |
| `/docs/user-roles.md` | Role permissions, firm scoping, status flows |
| `/docs/database-schema.md` | Full Postgres schema + join tables + amount_paid formulas |
| `/docs/entity-cascade.md` | Delete/revert cascades, payment allocation engine |
| `/docs/jv-rules.md` | JV source types, GL resolution, reversal, fiscal periods |
| `/docs/invoice-gl-flow.md` | Purchase + sales invoices — OCR → GL → approval → learning |
| `/docs/auto-suggest-flow.md` | Supplier matching, GL suggest, bank recon auto-match, bank parsing, dedup |
| `/docs/gl-reports.md` | General Ledger, Trial Balance, P&L, Balance Sheet |
| `/docs/auth.md` | Login flow, middleware |
| `/docs/whatsapp-backend.md` | WhatsApp + OCR pipeline |
| `/docs/design.md` | UI design system, component patterns, global search |
| `/docs/platform-owner.md` | Platform owner portal, analytics dashboard |
| `/docs/signup-spec.md` | Employee self-signup, admin creation |

## Diagrams (open in Excalidraw)

| File | Contents |
|------|----------|
| `diagram-invoice-flow.excalidraw` | Invoice lifecycle: upload → supplier match → GL suggest → approval → JV → bank recon → paid |
| `diagram-claim-flow.excalidraw` | Claim lifecycle: submit → review → approve (no JV) → bank recon → JV → paid |
| `diagram-bank-recon-flow.excalidraw` | Bank recon: upload → 4-pass auto-match → review → confirm → JV (3 match types) |
