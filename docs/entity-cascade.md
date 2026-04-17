# Entity Cascade & Structural Rules

Hard guardrails for delete, revert, and cascade behavior. Every developer (human or AI) must follow these rules exactly.

---

## Golden Rules

1. **JVs are never hard deleted** — only reversed (new JV with flipped DR/CR, both stay `posted`)
2. **Delete is blocked** if entity has downstream links — user must unlink first
3. **Revert cascades backward** — undoes ALL downstream effects in reverse order
4. **Soft-delete for reference entities** — Suppliers, Employees, GL Accounts use `is_active = false`
5. **No orphaned JVs** — every delete/revert that touches an approved record MUST reverse its JVs
6. **No orphaned payments** — when last PaymentAllocation is removed, auto-delete the parent Payment

---

## Prisma Cascade Rules (Database Level)

### Hard Cascade (onDelete: Cascade)
These are deleted automatically when parent is deleted:

| Child | Parent | Meaning |
|-------|--------|---------|
| `InvoiceLine` | `Invoice` | Line items go with invoice |
| `JournalLine` | `JournalEntry` | JV lines go with JV |
| `SupplierAlias` | `Supplier` | Aliases go with supplier |
| `PaymentAllocation` | `Invoice` or `Payment` | Allocations go with either side |
| `PaymentReceipt` | `Claim` or `Payment` | Receipt links go with either side |
| `InvoiceReceiptLink` | `Invoice` or `Claim` | Receipt-invoice links go with either |
| `BankTransactionInvoice` | `BankTransaction` or `Invoice` | Bank-invoice links go with either |
| `BankTransactionClaim` | `BankTransaction` or `Claim` | Bank-claim links go with either |
| `BankTransaction` | `BankStatement` | Transactions go with statement |
| `SalesInvoiceItem` | `SalesInvoice` | Items go with sales invoice |
| `SalesPaymentAllocation` | `Payment` or `SalesInvoice` | Allocations go with either |
| `AccountantFirm` | `User` or `Firm` | Assignment goes with either |
| `CategoryFirmOverride` | `Category` | Override goes with category |

### SetNull (onDelete: SetNull)
These are nulled out when parent is deleted:

| Field | On Delete Of |
|-------|-------------|
| `Firm.default_*_gl_id` fields | `GLAccount` |
| `Claim.tax_code_id` | `TaxCode` |
| `Claim.matched_bank_txn_id` | `BankTransaction` |

---

## Entity-by-Entity Rules

### Claim

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes, with conditions |
| **Delete blocker** | Has linked `PaymentReceipt` records (must remove payments first) |
| **Delete cascade** | 1. Reverse `claim_approval` JVs (if approved) → 2. Delete `BankTransactionClaim` links + revert bank txn to `unmatched` + reverse `bank_recon` JVs → 3. Delete `InvoiceReceiptLink` records + recalc invoice `amount_paid` → 4. Hard delete claim |
| **Edit approved** | Auto-reverts approval, reverses JVs, resets to `reviewed`/`pending_review` |
| **Soft delete?** | No — hard delete only |
| **Audit** | Logs old values (merchant, amount, status, approval) |

### Invoice (Purchase)

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes |
| **Delete blocker** | None explicit — cascades handle everything |
| **Delete cascade** | 1. Reverse `invoice_posting` JVs (if approved) → 2. Prisma cascades: `InvoiceLine`, `PaymentAllocation`, `BankTransactionInvoice`, `InvoiceReceiptLink` |
| **Approval revert** | Changes `approved` → `pending_approval`, reverses `invoice_posting` JVs |
| **Edit when approved** | Blocked for financial fields (amount, GL, dates). Must revert approval first. |
| **Line items** | Old lines deleted and recreated on edit. Totals recalculated from lines. |

### Payment

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes, but only if orphaned (zero `PaymentAllocation` records) |
| **Delete blocker** | Has active `PaymentAllocation` records |
| **Delete cascade** | 1. If bank-matched: reverse `bank_recon` JV, revert bank txn to `unmatched` → 2. Delete `PaymentReceipt` records → 3. Recalc claim payment status for each linked claim → 4. Delete payment |
| **Orphan auto-cleanup** | When last `PaymentAllocation` is removed, parent Payment is auto-deleted along with its `PaymentReceipt` links |

### PaymentAllocation

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes |
| **Delete cascade** | 1. Recalc invoice `amount_paid` → 2. If parent Payment now has zero allocations: auto-delete Payment + its PaymentReceipts + recalc claim payment status |

### Bank Statement

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes — cascades are comprehensive |
| **Delete cascade (multi-step)** | 1. Revert ALL bank transaction matches (delete `BankTransactionInvoice`, `BankTransactionClaim`, clear `matched_sales_invoice_id`, revert claims to `unpaid`) → 2. Recalc all affected invoice `amount_paid` → 3. Clean up legacy auto-matched Payments + PaymentReceipts → 4. Reverse ALL `bank_recon` JVs for matched transactions → 5. Delete all `BankTransaction` records (Prisma cascade) → 6. Delete statement |
| **Partial success** | JV reversal errors are logged but don't block deletion. Returns HTTP 207 if reversal errors occur. |

### Bank Transaction

| Rule | Detail |
|------|--------|
| **Can hard delete?** | No — only deleted via parent BankStatement cascade |
| **Unmatch (revert)** | POST to unmatch endpoint → 1. Reverse `bank_recon` JVs → 2. Delete `BankTransactionInvoice` + recalc invoice `amount_paid` → 3. Clear `matched_sales_invoice_id` + update sales invoice → 4. Delete `BankTransactionClaim` + clear claim `matched_bank_txn_id` + set claim `payment_status` to `unpaid` → 5. Delete legacy auto-matched Payment if notes contain "Auto-matched from receipt" → 6. Clear all match fields on transaction |

### Journal Entry

| Rule | Detail |
|------|--------|
| **Can hard delete?** | NEVER |
| **Reversal** | Creates new JV with flipped DR/CR. Both original + reversal stay `posted`. Linked via `reversed_by_id` / `reversal_of_id` bidirectionally. |
| **Reversal date** | Try original posting date first → fallback to today if no open period for original date |
| **Idempotency** | Before creating: checks if posted JV already exists for same `source_type` + `source_id` |
| **Source-based reversal** | `reverseJVsForSource(sourceType, sourceId)` finds and reverses all JVs for a given source |

### Supplier

| Rule | Detail |
|------|--------|
| **Can hard delete?** | No (no delete endpoint) |
| **Soft delete** | Set `is_active = false` |
| **Why no hard delete** | Referenced by invoices, payments, supplier aliases. Hard delete would orphan invoice history. |

### Employee

| Rule | Detail |
|------|--------|
| **Can hard delete?** | No (no delete endpoint) |
| **Soft delete** | Set `is_active = false`, `status = 'rejected'` via reject endpoint |
| **Why no hard delete** | `Claim.employee_id` is NOT nullable. Hard delete would violate FK. |

### GL Account

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes, with strict checks |
| **Delete blockers** | Referenced by `JournalLine`, has child accounts (`parent_id`), referenced by `Claim` or `Invoice`, or `is_system = true` |
| **Error message** | "Cannot delete — this account is referenced by {count} journal entries, child accounts, claims, invoices. Deactivate instead." |
| **Soft delete** | Set `is_active = false` (preferred over hard delete) |

### Category

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes — firm-specific only. Global categories cannot be deleted. |
| **Soft delete** | Via `CategoryFirmOverride.is_active = false` to disable per-firm |

### Fiscal Year / Period

| Rule | Detail |
|------|--------|
| **Can hard delete?** | No |
| **Close cascade** | 1. Create year-end closing JVs (zero out Revenue/Expense → post net to Retained Earnings, source: `year_end_close`) → 2. Close all periods → 3. Close FY |
| **Reopen cascade** | 1. Reopen FY → 2. Reopen all non-locked periods → 3. Reverse `year_end_close` JVs |

### Sales Invoice

| Rule | Detail |
|------|--------|
| **Can hard delete?** | Yes (implied) |
| **Delete cascade** | Prisma cascades: `SalesInvoiceItem`, `SalesPaymentAllocation` |
| **Approval revert** | Reverses `sales_invoice_posting` JVs |

---

## amount_paid Calculation Rules

These are critical — getting them wrong causes GL drift.

| Entity | Formula | Source of Truth |
|--------|---------|----------------|
| **Invoice** | `MAX(receipt_total, bank_recon_total)` where `receipt_total = SUM(InvoiceReceiptLink.amount)` and `bank_recon_total = SUM(BankTransactionInvoice.amount)` | Bank recon takes priority |
| **Claim** | `SUM(PaymentReceipt.amount) + SUM(InvoiceReceiptLink.amount)` | Combined from both sources |
| **Sales Invoice** | `SUM(SalesPaymentAllocation.amount)` | Direct allocation |

The `recalcInvoicePaid()` function handles invoice recalculation from both receipt links AND bank recon allocations.

---

## Cascade Flow Diagram

```
Employee submits claim/receipt
    ↓
status: pending_review, approval: pending_approval
    ↓ Admin reviews
status: reviewed
    ↓ Accountant approves
approval: approved → JV created (claims/mileage only, NOT receipts)
    ↓ Used downstream:
    ├── InvoiceReceiptLink → invoice aging (amount_paid)
    ├── BankTransactionClaim → bank recon match
    │   └── bank_recon JV created (receipts get JV HERE)
    └── PaymentReceipt → payment tracking

REVERT undoes in reverse order:
    Delete bank links → reverse bank_recon JV
    Delete invoice links → recalc invoice amount_paid
    Revert approval → reverse claim_approval JV
```

---

## Summary Matrix

| Entity | Hard Delete? | Blocker | Soft Delete? | JV Reversal? |
|--------|-------------|---------|-------------|-------------|
| Claim | Yes | PaymentReceipt exists | No | claim_approval + bank_recon |
| Invoice | Yes | None | No | invoice_posting |
| Payment | Orphaned only | PaymentAllocation exists | No | bank_recon (if matched) |
| PaymentAllocation | Yes | None | No | No (data cleanup) |
| BankStatement | Yes | None (cascades) | No | bank_recon (all txns) |
| BankTransaction | No (via statement) | N/A | No | bank_recon (unmatch) |
| JournalEntry | **NEVER** | — | Via reversal | Manual reverse |
| Supplier | No | Has invoices | is_active | No |
| Employee | No | Has claims | is_active/reject | No |
| GLAccount | With checks | JV/claims/invoices/children | is_active | No |
| Category | Firm-only | None | Via override | No |
| FiscalYear | No | — | Via close/reopen | year_end_close |
| SalesInvoice | Yes | None | No | sales_invoice_posting |
