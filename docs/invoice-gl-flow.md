# Invoice GL Resolution & Supplier Learning

End-to-end flow from upload to approval, showing how GL accounts are resolved and how the system learns from each approval. Covers both **purchase invoices** (payables) and **sales invoices** (receivables).

---

## Purchase Invoices (Payables)

### Phase 1: Upload (OCR + Supplier Matching)

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

### Phase 2: Preview (GL Auto-Suggest)

When the accountant opens the invoice preview, GL accounts are resolved in this order:

#### Expense GL (Debit)

```
1. invoice.gl_account_id          (previously saved on this invoice)
2. supplier.default_gl_account_id (learned from past approvals)
3. alias supplier's GL            (via /api/suppliers/by-alias lookup)
4. category -> GL mapping         (from CategoryFirmOverride table)
5. empty                          (accountant must select manually)
```

#### Contra GL (Credit)

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

### Phase 3: Approval (Transactional JV + Supplier Learns)

```
Accountant clicks Approve
    |
    v
Confirmation modal shows JV preview:
    Debit:  [Expense GL]  RM X,XXX.XX       (multi-line if line items exist)
    Credit: [Contra GL]   RM X,XXX.XX
    |
    v
Accountant clicks "Confirm & Post JV"
    |
    v
All inside a single $transaction:
    1. Invoice updated: approval = "approved", status = "reviewed"
    2. Journal Entry created with debit + credit lines
    3. GL saved to invoice record for display
    4. GL saved to supplier record:
       - default_gl_account_id        (if not already set, single-GL only)
       - default_contra_gl_account_id (ALWAYS saved with resolved value)
```

**Transaction safety:** If any step fails, the entire operation rolls back. No orphaned approved invoices without JVs.

**Key rule:** Contra GL is **always** saved to the supplier on approval, even if the supplier already had one. This ensures the accountant's explicit selection takes priority and improves future auto-fill.

---

### Phase 4: Next Invoice (Auto-Fill)

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

## Sales Invoices (Receivables)

Sales invoices now live in the same `Invoice` table with `type: 'sales'`. The supplier relation represents the buyer.

### JV Structure (reversed from purchase invoices)

```
DR  Trade Receivables (contra)   RM X,XXX.XX
CR  Revenue GL                   RM X,XXX.XX
```

### GL Resolution

#### Revenue GL (Credit)

```
1. invoice.gl_account_id         (previously saved on this invoice, type='sales')
2. category -> GL mapping        (category.gl_account_id)
3. empty                         (accountant must select manually)
```

#### Contra GL — Trade Receivables (Debit)

```
1. invoice.contra_gl_account_id  (previously saved)
2. empty                         (accountant must select manually)
```

### Current Gaps (TODO)

| Gap | Purchase Invoice | Sales Invoice |
|-----|-----------------|---------------|
| **Supplier/customer learning** | Supplier learns GL on approval ✅ | Supplier learns GL on creation ✅ |
| **Fuzzy name matching** | Matches vendor name against Liability GLs | Not implemented |
| **Firm default contra GL** | Falls back to `default_trade_payables_gl_id` | `default_trade_receivables_gl_id` exists in schema but NOT used |
| **Alias-based GL lookup** | Via `/api/suppliers/by-alias` | Not implemented |
| **Transaction safety** | Transactional (invoice + JV + learning) | Same unified API — transactional ✅ |

### Planned Improvements

1. **Firm default fallback** — use `default_trade_receivables_gl_id` when no contra GL selected
2. **Customer name matching** — fuzzy match buyer name against Asset GL account names

---

## Special Cases

### Credit Notes (Negative Amounts)
- **Purchase:** Debit/credit reversed: DR Trade Payables, CR Expense GL
- **Sales:** Debit/credit reversed: DR Revenue GL, CR Trade Receivables
- JV description includes "Credit Note" prefix

### Line Items (Multi-GL) — Purchase Invoices Only
- Each line item can have its own GL account
- JV has multiple debit lines (one per unique GL) + one credit line (contra)
- Supplier default GL only saved when all lines use the same GL
- Confirmation modal shows all line item GLs in JV preview

### Bank Reconciliation (Receipts)
- Receipts get JV at bank recon, NOT at approval
- GL resolution: Bank GL (from bank account mapping) + Expense GL (from category/supplier)

---

## Resolution Chain Summary

| Entity | Debit GL Source | Credit GL Source |
|--------|---------------|-----------------|
| **Purchase Invoice** | User-selected → supplier default → alias → category → empty | User-selected → supplier default → alias → fuzzy name match → firm default |
| **Sales Invoice** | User-selected → firm default Trade Receivables → empty | User-selected → category GL → empty |
| **Claim** | User-selected → category override → firm default | Staff Claims Payable (firm default) |
| **Receipt** (bank recon) | Bank account GL mapping | User-selected → category → firm default |
| **Payment Voucher** | User-selected → category → firm default | Bank account GL mapping |

---

## Payment Vouchers (PV) & Official Receipts (OR)

### What They Are

- **Payment Voucher (PV):** An Invoice record created from a bank recon **debit** transaction (money going out). Pre-approved, auto-paid, no document.
- **Official Receipt (OR):** An Invoice record (`type: 'sales'`) created from a bank recon **credit** transaction (money coming in). Pre-approved, auto-paid, no document.

Both are created when a bank transaction has no matching invoice — the accountant creates one inline to record the payment.

### Numbering

Format: `PV-001`, `PV-002`, `OR-001`, `OR-002` — sequential per firm, no firm name in the number.

- Sequence is global per firm (not per supplier)
- Different firms can have the same numbers (e.g., both Firm A and Firm B have PV-001)
- Old records using the legacy format (`PV-{SUPPLIER}-001`) are left as-is
- Frontend calls `/api/bank-reconciliation/next-voucher-number` (PV) or `/api/bank-reconciliation/next-receipt-number` (OR) to get the next number
- Backend create routes also generate the number as a fallback if no reference is provided

### PV Document Attachment

Payment goes out first, actual invoice arrives later. Two paths to attach the real document:

**Path 1 — Preview modal:** Open the PV in the invoice preview modal → right panel shows an "Attach Document" dropzone → upload file → OCR runs → warns if amount/vendor mismatch → file saved.

**Path 2 — Normal upload auto-detect:** Upload an invoice normally → after OCR, system calls `/api/invoices/match-voucher` to find a PV with matching vendor + amount (within RM 0.01) → if found, blue banner prompts "Attach to PV-XXX?" → Yes calls `/api/invoices/{id}/attach`.

**Path 3 — Bank recon preview:** In the accountant's bank recon preview modal, PV invoices with no document show a small "Attach" button inline on the matched invoice block.

#### Rules

- **No double accounting:** Attaching a file only updates `file_url`, `file_download_url`, `thumbnail_url`, `file_hash`. No new Invoice, no new JV.
- **Invoice number update:** If OCR extracts a real invoice number, `invoice_number` is updated from `PV-XXX` to the real number.
- **Vendor/amount mismatch:** Warn only, no auto-edit. File is saved regardless.
- **Dedup check:** SHA256 file hash checked before upload — rejects if same file already attached to another invoice.
- **Supplier link status:** PV creation sets `supplier_link_status: 'confirmed'` (not the default `unmatched`).

### "No doc" Indicator

PV invoices with `file_url === null` show an amber "No doc" badge:

| Location | Condition |
|----------|-----------|
| Invoice list table | PV- prefix + no file_url |
| Bank recon transaction row | `manually_matched` + PV- prefix + no file_url (not shown for `matched`/suggested) |
| Bank recon preview modal (accountant) | PV- prefix + no file_url, inline on matched invoice block |
| Bank recon admin inline expansion | PV- prefix + no file_url, in "Linked Invoices" section |

### Key Files

| File | Role |
|------|------|
| `app/api/bank-reconciliation/next-voucher-number/route.ts` | Next PV number (per-firm sequence) |
| `app/api/bank-reconciliation/next-receipt-number/route.ts` | Next OR number (per-firm sequence) |
| `app/api/bank-reconciliation/create-voucher/route.ts` | Create PV (accountant) |
| `app/api/admin/bank-reconciliation/create-voucher/route.ts` | Create PV (admin) |
| `app/api/bank-reconciliation/create-receipt/route.ts` | Create OR (accountant) |
| `app/api/admin/bank-reconciliation/create-receipt/route.ts` | Create OR (admin) |
| `app/api/invoices/[id]/attach/route.ts` | Attach document to existing PV |
| `app/api/invoices/match-voucher/route.ts` | Find PV matching vendor + amount for upload auto-detect |

---

## Key Files

### Purchase Invoices
| File | Role |
|------|------|
| `components/pages/InvoicesPageContent.tsx` | GL auto-suggest logic (useEffect that fetches GL + alias + settings on preview open) |
| `app/api/invoices/route.ts` | Single invoice creation + auto-approve (transactional: invoice + JV + supplier learning) |
| `app/api/invoices/batch/route.ts` | Batch invoice approval (transactional: update + JV + supplier learning) |
| `app/api/suppliers/by-alias/route.ts` | Alias lookup for GL auto-fill |
| `lib/journal-entries.ts` | `createJournalEntry()` — creates JV with lines, supports `tx` for caller transactions |
| `components/invoices/InvoicePreviewPanel.tsx` | Approval confirmation modal with JV preview (shows line items when present) |

### Sales Invoices
Sales invoices are now managed through the unified Invoice table (`type: 'sales'`) and the same API endpoints:
| File | Role |
|------|------|
| `components/pages/InvoicesPageContent.tsx` | Unified page — type toggle filters PI/SI/PV/OR/CN/DN |
| `app/api/invoices/route.ts` | Handles both purchase and sales — POST with `type: 'sales'` for SI/DN/OR |
| `app/api/invoices/batch/route.ts` | Batch approval handles both types |

Last verified: 2026-04-29
