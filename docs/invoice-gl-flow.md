# Invoice GL Resolution & Supplier Learning

End-to-end flow from upload to approval, showing how GL accounts are resolved and how the system learns from each approval.

---

## Phase 1: Upload (OCR + Supplier Matching)

```
File uploaded (WhatsApp / Dashboard / Batch)
    |
    v
OCR extracts vendor_name_raw
    |
    v
Supplier matching:
    1. SupplierAlias table — exact vendor name match
       |-- Found (confirmed alias) --> link supplier, status = "confirmed"
       |-- Found (unconfirmed alias) --> link supplier, status = "auto_matched"
       |-- Not found --> step 2
    2. Fuzzy match existing supplier names
       |-- Match found --> link supplier, status = "auto_matched"
       |-- No match --> status = "unmatched"
    |
    v
Invoice created with:
    - vendor_name_raw (from OCR)
    - supplier_id (if matched)
    - supplier_link_status (confirmed / auto_matched / unmatched)
    - gl_account_id = null (not yet assigned)
    - contra_gl_account_id = null (not yet assigned)
```

**First-time allocation:** When admin/accountant manually confirms a supplier, the vendor name is saved as a `SupplierAlias` so future invoices from the same vendor auto-match.

---

## Phase 2: Preview (GL Auto-Suggest)

When the accountant opens the invoice preview, GL accounts are resolved in this order:

### Expense GL (Debit)

```
1. invoice.gl_account_id          (previously saved on this invoice)
2. supplier.default_gl_account_id (learned from past approvals)
3. alias supplier's GL            (via /api/suppliers/by-alias lookup)
4. category -> GL mapping         (from CategoryFirmOverride table)
5. empty                          (accountant must select manually)
```

### Contra GL (Credit)

```
1. invoice.contra_gl_account_id            (previously saved)
2. supplier.default_contra_gl_account_id   (learned from past approvals)
3. alias supplier's contra GL              (via /api/suppliers/by-alias)
4. Fuzzy name match:
   - Strip vendor name to words (exclude "sdn", "bhd", "plt")
   - Match against Liability GL account names
   - Substring match first, then 2+ word overlap
   - e.g. "Tri T Corrugated Box" matches GL "TRI T CORRUGATED BOX SDN BHD"
5. Firm default Trade Payables GL          (from accounting-settings)

NOTE: If resolved contra = firm default (generic), still runs fuzzy name
match (step 4) to find a supplier-specific sub-account.
```

---

## Phase 3: Approval (JV Posted + Supplier Learns)

```
Accountant clicks Approve
    |
    v
Confirmation modal shows JV preview:
    Debit:  [Expense GL]  RM X,XXX.XX
    Credit: [Contra GL]   RM X,XXX.XX
    |
    v
Accountant clicks "Confirm & Post JV"
    |
    v
1. Invoice updated: approval = "approved", status = "reviewed"
2. Journal Entry created with debit + credit lines
3. GL saved to supplier record:
   - default_gl_account_id      (if not already set)
   - default_contra_gl_account_id (ALWAYS overwritten with selected value)
4. GL saved to invoice record for display
```

**Key rule:** Contra GL is **always** saved to the supplier on approval, even if the supplier already had one. This ensures the accountant's explicit selection takes priority and improves future auto-fill.

---

## Phase 4: Next Invoice (Auto-Fill)

```
Next invoice from same supplier uploaded
    |
    v
Supplier auto-matched via alias
    |
    v
Preview opens:
    - Expense GL: auto-filled from supplier.default_gl_account_id
    - Contra GL:  auto-filled from supplier.default_contra_gl_account_id
    |
    v
Accountant only needs to verify, not re-select
```

---

## Special Cases

### Credit Notes (Negative Amounts)
- Debit/credit are **reversed**: Debit = Trade Payables, Credit = Expense GL
- JV description includes "Credit Note" prefix

### Line Items (Multi-GL)
- Each line item can have its own GL account
- JV has multiple debit lines (one per unique GL) + one credit line (contra)
- Supplier default GL only saved when all lines use the same GL

### Bank Reconciliation (Receipts)
- Receipts get JV at bank recon, NOT at approval
- GL resolution: Bank GL (from bank account mapping) + Expense GL (from category/supplier)

---

## Resolution Chain Summary

| Entity | Debit GL Source | Credit GL Source |
|--------|---------------|-----------------|
| **Invoice** | User-selected -> supplier default -> alias -> category -> empty | User-selected -> supplier default -> alias -> fuzzy name match -> firm default |
| **Claim** | User-selected -> category override -> firm default | Staff Claims Payable (firm default) |
| **Receipt** (bank recon) | Bank account GL mapping | User-selected -> category -> firm default |
| **Payment Voucher** | User-selected -> category -> firm default | Bank account GL mapping |

---

## Key Files

| File | Role |
|------|------|
| `components/pages/InvoicesPageContent.tsx` | GL auto-suggest logic (lines 858-899) |
| `app/api/invoices/route.ts` | Single invoice approval + GL save to supplier |
| `app/api/invoices/batch/route.ts` | Batch invoice approval + GL save to supplier |
| `app/api/suppliers/by-alias/route.ts` | Alias lookup for GL auto-fill |
| `lib/journal-entries.ts` | `createJournalEntry()` — creates JV with lines |
| `components/invoices/InvoicePreviewPanel.tsx` | Approval confirmation modal with JV preview |
