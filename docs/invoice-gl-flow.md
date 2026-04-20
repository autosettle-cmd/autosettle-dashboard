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

### JV Structure (reversed from purchase invoices)

```
DR  Trade Receivables (contra)   RM X,XXX.XX
CR  Revenue GL                   RM X,XXX.XX
```

### GL Resolution

#### Revenue GL (Credit)

```
1. salesInvoice.gl_account_id    (previously saved on this invoice)
2. category -> GL mapping        (category.gl_account_id)
3. empty                         (accountant must select manually)
```

#### Contra GL — Trade Receivables (Debit)

```
1. salesInvoice.contra_gl_account_id   (previously saved)
2. empty                                (accountant must select manually)
```

### Current Gaps (TODO)

| Gap | Purchase Invoice | Sales Invoice |
|-----|-----------------|---------------|
| **Supplier/customer learning** | Supplier learns GL on approval | No learning — manual every time |
| **Fuzzy name matching** | Matches vendor name against Liability GLs | Not implemented |
| **Firm default contra GL** | Falls back to `default_trade_payables_gl_id` | `default_trade_receivables_gl_id` exists in schema but NOT used |
| **Alias-based GL lookup** | Via `/api/suppliers/by-alias` | Not implemented |
| **Transaction safety** | Transactional (invoice + JV + learning) | **NOT transactional — needs fix** |
| **Auto-approve on upload** | Transactional if GL provided | JV created outside transaction |

### Planned Improvements

1. **Transaction wrap** — same pattern as purchase invoices
2. **Customer GL learning** — save Revenue GL + Trade Receivables to customer record on approval
3. **Firm default fallback** — use `default_trade_receivables_gl_id` when no contra GL selected
4. **Customer name matching** — fuzzy match buyer name against Asset GL account names

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
| File | Role |
|------|------|
| `components/SalesInvoicesContent.tsx` | Sales invoice page, GL selection, approval actions |
| `app/api/sales-invoices/route.ts` | Sales invoice creation + auto-approve (needs transaction wrap) |
| `app/api/sales-invoices/batch/route.ts` | Batch sales invoice approval (needs transaction wrap) |
