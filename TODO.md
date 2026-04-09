# TODO

## Fix: Show error when uploading without selecting a firm
- [ ] Bank Recon: show "Please select a firm" error if user clicks Upload & Parse without choosing a firm
- [ ] Invoices: same
- [ ] Claims: same

## Fix: OCR auto-fill not working on Vercel (Gemini billing required)
- [ ] Enable billing on Google Cloud project `drive-uploader-485013`: https://console.developers.google.com/billing/enable?project=drive-uploader-485013
- [ ] After billing enabled, verify invoice/claim OCR auto-fill works on deployed app
- [ ] Consider: add Google Vision API fallback for OCR when Gemini is unavailable (Vision uses API key, no billing needed)
- Root cause: Invoice/claim OCR always uses Gemini (Vertex AI), which requires billing. Bank recon works because regex parser handles it without Gemini.

## Multi-receipt detection: extract multiple receipts from one photo
- [ ] Update Gemini OCR prompt to detect and return an array of receipts when multiple are in one image
- [ ] Update `extractWithGemini` in `lib/whatsapp/gemini.ts` to return array instead of single result
- [ ] Dashboard batch upload: if OCR returns multiple receipts from one image, create a claim for each
- [ ] WhatsApp flow: if multiple receipts detected, create multiple claims and confirm count to user
- Common scenario: 3 receipts photographed side by side (TNG reload, toll, etc.)

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
