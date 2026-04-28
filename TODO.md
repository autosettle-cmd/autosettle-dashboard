# TODO

## Code Quality (from /audit 2026-04-28, re-audited 2026-04-28)

### High
- [ ] Consolidate admin/accountant route duplication — 61 admin routes mirror accountant (~2000+ lines)
- [ ] Refactor 7 oversized components — InvoicesPageContent (1913), ClaimsPageContent (1630), BankReconDetailContent (1555), BankReconMatchModal (1506), InvoicePreviewPanel (1221)
- [ ] Add AbortController to ~15 components with unguarded fetch useEffects
- [ ] Add onDelete rules to 42 schema relations — Cascade for firm FKs, SetNull for optional refs

### Medium
- [ ] Extract hardcoded `take: 100` to shared constant (low priority — only 11 uses)

### Low Priority
- [ ] Consolidate claims/stats + claims/counts into single endpoint

---

## Questions for accountant (DS Plus)
- [ ] Director (Lee Chia Wen) personal purchases — treat as claims or director's account/loan?
- [ ] Which GL account for director's loan/advances?
- [ ] Stationery folder: mix of Shopee invoices + receipt photos — should these be invoices or claims?
- [ ] Does he want separate fiscal years (FY2023, FY2024, FY2025) or just one?

## Batch upload via WhatsApp
- [ ] Allow users to send multiple images/PDFs in one WhatsApp session and have them all processed
- [ ] Consider: zip file upload via WhatsApp, or multi-image message handling
- [ ] Each file goes through normal OCR → pending_review flow


## Fix: OCR auto-fill not working on Vercel
- [ ] Add `GOOGLE_AI_API_KEY` env var on Vercel (get from https://aistudio.google.com/apikey)
- [ ] Verify invoice/claim OCR auto-fill works on deployed app

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
