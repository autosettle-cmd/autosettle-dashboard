# TODO

## Fix: Upload modal should auto-select firm from sidebar filter
- [ ] Bank Recon upload modal: pre-fill firm from `firmFilter` (sidebar selector) so accountant doesn't have to select again
- [ ] Invoice upload modal: same — use sidebar firm as default
- [ ] Claims upload modal: same
- Affects: `app/accountant/bank-reconciliation/page.tsx`, `app/accountant/invoices/page.tsx`, `app/accountant/claims/page.tsx`

## Fix: Audit log not recording bank statement deletion
- [ ] Add `auditLog()` call in bank statement delete endpoint when a statement is deleted
- Affects: `app/api/bank-reconciliation/statements/delete/route.ts` (or similar)

## Bank Statement Parser: Add regex for more bank formats
- [ ] OCBC — upload sample statement, build regex parser in `lib/bank-pdf-parser.ts`
- [ ] CIMB — upload sample statement, build regex parser
- [ ] Public Bank — upload sample statement, build regex parser
- [ ] Hong Leong — upload sample statement, build regex parser
- [ ] RHB — upload sample statement, build regex parser
- Note: Gemini fallback handles edge cases automatically, but regex is faster and free

## Bank Recon: Test overlapping statement deduplication
- [ ] Upload a partial statement (e.g. Apr 1–8) → verify transactions created
- [ ] Upload full month statement (e.g. Apr 1–30) for same account → verify Apr 1–8 transactions skipped, Apr 9–30 created
- [ ] Confirm matched/excluded status on partial statement transactions is untouched
- [ ] Verify alert shows "X duplicates skipped" on upload
- [ ] Test with same-day same-amount different transactions (should NOT be deduped)
- [ ] Test with different bank accounts (should be fully independent)
