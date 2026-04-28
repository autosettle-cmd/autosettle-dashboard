# Autosettle Data Flow Audit Checklist

Use this form to verify every data path in the app. For each flow, check if the behavior is correct and note what needs changing.

---

## 1. CLAIMS (Expense Claims)

### 1a. Claim Submission
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Employee submits claim via dashboard | Status: `pending_review`, Approval: `pending_approval` | [ ] | |
| Employee submits claim via WhatsApp | Same as above + OCR extraction | [ ] | |
| Accountant uploads claim on behalf | Status: `reviewed` (skip pending_review) | [ ] | |
| Dedup check fires on duplicate receipt# | Blocked with error message | [ ] | |

### 1b. Claim Review & Approval
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Admin reviews claim → "Mark as Reviewed" | Status: `reviewed` | [ ] | |
| Accountant approves claim | Approval: `approved` | [ ] | |
| **JV created on approval?** | DR Expense GL / CR Staff Claims GL | [ ] | |
| GL accounts correct on JV? | Uses claim's `gl_account_id` + `contra_gl_account_id` | [ ] | |
| Accountant rejects claim | Approval: `rejected`, rejection_reason saved | [ ] | |

### 1c. Claim Payment
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Claim linked to invoice (receipt type) | `payment_status` updates, `linked_payment_count` includes invoice links | [ ] | |
| Claim matched in bank recon | `matched_bank_txn_id` set, payment_status updates | [ ] | |
| Claim payment via Payment record | PaymentReceipt link, recalcClaimPayment runs | [ ] | |
| Revert approved claim | JV reversed, approval reset | [ ] | |

---

## 2. RECEIPTS (type=receipt on Claim)

### 2a. Receipt Submission
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Upload receipt via dashboard | Type: `receipt`, status: `pending_review` | [ ] | |
| Upload receipt via WhatsApp | Same + OCR | [ ] | |
| Batch upload multiple receipts | OCR all → batch review → submit | [ ] | |

### 2b. Receipt → Invoice Linking
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Open receipt preview | Auto-searches invoices by merchant name | [ ] | |
| Auto-link fires (score >= 2) | InvoiceReceiptLink created, payment_status updates | [ ] | |
| Manual search & link | Search by invoice# or supplier, link created | [ ] | |
| Unlink receipt from invoice | Link deleted, recalcClaimPayment + recalcInvoicePaid | [ ] | |
| `linked_payment_count` includes invoice links? | Count = PaymentReceipts + InvoiceReceiptLinks | [ ] | |
| Invoice `amount_paid` updated after linking? | recalcInvoicePaid runs | [ ] | |

### 2c. Receipt in Edit Mode
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Linked Invoices section visible in edit mode | Shows current links + search | [ ] | |
| Can change linked invoice while editing | Unlink old, link new | [ ] | |

---

## 3. MILEAGE CLAIMS

| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Submit mileage claim | Amount = distance_km * firm rate | [ ] | |
| WhatsApp mileage flow | Step-by-step: from → to → distance → purpose | [ ] | |
| Approval creates JV? | DR Mileage Expense GL / CR Staff Claims GL | [ ] | |
| Firm mileage rate used? | From `firm.mileage_rate_per_km` | [ ] | |

---

## 4. INVOICES (Accounts Payable)

### 4a. Invoice Submission
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Upload invoice via dashboard | Status: `pending_review` | [ ] | |
| Upload invoice via WhatsApp | OCR extracts vendor, amount, date, invoice# | [ ] | |
| Credit note (negative amount) | Detected by OCR, amber UI alert | [ ] | |
| Supplier auto-matched? | `supplier_link_status` set | [ ] | |

### 4b. Invoice Review & Approval
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Admin reviews → "Mark as Reviewed" | Status: `reviewed` | [ ] | |
| Accountant approves invoice | Approval: `approved` | [ ] | |
| **JV created on approval?** | DR Expense GL / CR Trade Payables GL | [ ] | |
| GL accounts correct? | Expense from invoice `gl_account_id`, contra from supplier default or firm default | [ ] | |
| Supplier default GL learned on first approval? | `supplier.default_gl_account_id` saved | [ ] | |

### 4c. Invoice Multi-Select Bulk Actions
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Checkbox column on invoices table | Select individual rows or "select all" | [ ] | |
| Bulk bar appears at bottom | Shows count + Approve / Reject / Delete buttons | [ ] | |
| Bulk approve | All selected invoices approved (with GL validation per item) | [ ] | |
| Bulk reject | All selected invoices rejected | [ ] | |
| Bulk delete | All selected invoices soft-deleted | [ ] | |
| Firm setup guard on upload | Blocks upload if COA or fiscal year incomplete | [ ] | |

### 4d. Invoice Payment
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Payment allocated to invoice | PaymentAllocation created, recalcInvoicePayment | [ ] | |
| Invoice fully paid | `payment_status: 'paid'` | [ ] | |
| Invoice partially paid | `payment_status: 'partially_paid'` | [ ] | |
| Apply credit (auto-allocate) | Oldest invoices paid first from unallocated payments | [ ] | |
| Receipt linked to invoice | InvoiceReceiptLink, recalcInvoicePaid | [ ] | |

---

## 5. SALES INVOICES (Accounts Receivable / Issued)

Now stored in the unified `Invoice` table with `type: 'sales'`. Same API endpoints as purchase invoices.

### 5a. Sales Invoice Creation
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Manual creation on Invoices page (SI toggle) | Invoice with `type: 'sales'`, status: `pending_approval` | [ ] | |
| Created via Official Receipt (bank recon) | Invoice with `type: 'sales'`, status: `approved`, payment: `paid`, linked to bank txn | [ ] | |

### 5b. Sales Invoice Approval & Payment
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Accountant approves sales invoice | JV created (`sales_invoice_posting`) | [ ] | |
| Bank recon match to sales invoice | `matched_invoice_id` set on BankTransaction | [ ] | |
| LHDN e-invoicing submission | Only if Phase 4 API connected | [ ] | |

---

## 6. BANK RECONCILIATION

### 6a. Statement Upload
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Upload PDF bank statement | Parsed, transactions created | [ ] | |
| Duplicate detection | Skips duplicate transactions | [ ] | |
| OCBC / Maybank format support | Both parsed correctly | [ ] | |

### 6b. Auto-Match (Pass 1-4)
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Pass 1: Exact payment match | Debit txn → Payment by amount+date | [ ] | |
| Pass 2: Invoice match | Debit txn → Invoice by amount | [ ] | |
| Pass 3: Sales invoice match | Credit txn → Invoice (type='sales') by amount | [ ] | |
| Pass 4: Receipt match | Credit txn → Receipt by amount | [ ] | |

### 6c. Manual Match — Invoices
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Select invoice to match | BankTransactionInvoice created | [ ] | |
| Confirm match | JV: DR Trade Payables / CR Bank | [ ] | |
| Partial match (invoice > txn) | Allocation amount = txn amount | [ ] | |
| Multi-invoice match | Multiple allocations summing to txn amount | [ ] | |

### 6d. Manual Match — Claims
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Select claims to match | `matched_bank_txn_id` set on claims | [ ] | |
| Confirm match | JV: DR Staff Claims / CR Bank | [ ] | |
| Multi-claim match by employee | Multiple claims matched to one txn | [ ] | |

### 6e. Official Receipt (Credit txn)
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Create Official Receipt | **Invoice** (`type: 'sales'`) created (paid, approved) | [ ] | |
| Bank txn linked | `matched_invoice_id` = new Invoice (type='sales') | [ ] | |
| Receipt number auto-generated | OR-{PREFIX}-NNN based on supplier | [ ] | |
| GL account auto-suggested | From supplier default_gl_account_id | [ ] | |
| JV created | DR Bank GL / CR Income GL (user-selected) | [ ] | |
| "+" button hidden after match | Sales invoice amount included in allocation calc | [ ] | |
| New supplier created inline | Supplier record created if "+ New" used | [ ] | |

### 6f. Payment Voucher (Debit txn)
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Create Payment Voucher | **Invoice** created (paid, approved, reviewed) | [ ] | |
| Bank txn linked | BankTransactionInvoice join record | [ ] | |
| Voucher number auto-generated | PV-{PREFIX}-NNN based on supplier | [ ] | |
| GL account auto-suggested | From supplier default_gl_account_id | [ ] | |
| JV created | DR Expense GL (user-selected) / CR Bank GL | [ ] | |
| Category required? | Yes (Invoice model requires category_id) | [ ] | |
| New supplier created inline | Supplier record created if "+ New" used | [ ] | |

### 6g. Unmatch
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Unmatch invoice | BankTransactionInvoice deleted, JV reversed | [ ] | |
| Unmatch claims | `matched_bank_txn_id` nulled, JV reversed | [ ] | |
| Unmatch official receipt | Invoice (type='sales') stays? Or deleted? JV reversed | [ ] | |
| Unmatch payment voucher | Invoice stays? Or deleted? JV reversed | [ ] | |

### 6h. Exclude
| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Exclude transaction | `recon_status: 'excluded'`, no JV | [ ] | |
| Un-exclude | Back to `unmatched` | [ ] | |

---

## 7. JOURNAL ENTRIES

### 7a. JV Creation Triggers
| Trigger | JV Lines | Correct? | Notes / Changes Needed |
|---------|----------|----------|----------------------|
| Claim approved | DR Expense / CR Staff Claims | [ ] | |
| Invoice approved | DR Expense / CR Trade Payables | [ ] | |
| Bank recon: invoice match confirmed | DR Trade Payables / CR Bank | [ ] | |
| Bank recon: claim match confirmed | DR Staff Claims / CR Bank | [ ] | |
| Bank recon: official receipt | DR Bank / CR Income (user GL) | [ ] | |
| Bank recon: payment voucher | DR Expense (user GL) / CR Bank | [ ] | |
| Sales invoice approved | What JV? | [ ] | |

### 7b. JV Reversal Triggers
| Trigger | Expected | Correct? | Notes / Changes Needed |
|---------|----------|----------|----------------------|
| Revert claim approval | Reversal JV with opposite lines | [ ] | |
| Revert invoice approval | Reversal JV | [ ] | |
| Unmatch bank recon | Reversal JV | [ ] | |
| Edit approved claim | Auto-revert, then new JV on re-approval | [ ] | |

### 7c. JV Data Integrity
| Check | Expected | Correct? | Notes / Changes Needed |
|-------|----------|----------|----------------------|
| Every JV balances (DR = CR) | Sum of debits = sum of credits | [ ] | |
| Orphan JVs (no source record) | Cleanup button works on JE page | [ ] | |
| JV posting date matches source date | Uses transaction/claim/invoice date | [ ] | |
| JV reversal uses original date | With today fallback | [ ] | |

---

## 8. PAYMENTS

| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Create payment for supplier | Payment record, allocate to invoices | [ ] | |
| Delete payment | Only if no allocations; unlinks bank txn, reverses JV | [ ] | |
| Payment receipt links | Connects payment to claims/receipts | [ ] | |

---

## 9. SUPPLIERS

| Step | Expected | Correct? | Notes / Changes Needed |
|------|----------|----------|----------------------|
| Supplier aging report | Shows unpaid invoices by age bucket | [ ] | |
| Supplier statement | Lists all invoices + payments | [ ] | |
| Supplier default GL learned | Saved on first invoice approval | [ ] | |
| Walk-in Customer auto-created | Created if missing when official receipt/voucher submitted | [ ] | |

---

## 10. GENERAL LEDGER & REPORTS

| Check | Expected | Correct? | Notes / Changes Needed |
|-------|----------|----------|----------------------|
| General Ledger page | Shows all GL transactions with running balance | [ ] | |
| Trial Balance | All accounts balance (DR total = CR total) | [ ] | |
| Profit & Loss | Revenue - Expenses for period | [ ] | |
| Balance Sheet | Assets = Liabilities + Equity | [ ] | |
| Chart of Accounts | Drag-drop reorder, parent/child hierarchy | [ ] | |

---

## 11. PERMISSIONS & ROLES

| Action | Employee | Admin | Accountant | Correct? | Notes |
|--------|----------|-------|------------|----------|-------|
| Submit claims/receipts | Yes | Yes | Yes | [ ] | |
| Review claims/receipts | No | Yes | No (auto-skip) | [ ] | |
| Approve claims/invoices | No | No | Yes | [ ] | |
| Bank reconciliation | No | Yes | Yes | [ ] | |
| Create JV manually | No | No | Yes | [ ] | |
| View GL/reports | No | No | Yes | [ ] | |
| Manage employees | No | Yes | Yes | [ ] | |
| Manage categories | No | Yes | Yes | [ ] | |

---

## SUMMARY

| Area | Total Checks | Passed | Failed | Needs Change |
|------|-------------|--------|--------|-------------|
| Claims | | | | |
| Receipts | | | | |
| Mileage | | | | |
| Invoices | | | | |
| Sales Invoices | | | | |
| Bank Recon | | | | |
| Journal Entries | | | | |
| Payments | | | | |
| Suppliers | | | | |
| GL & Reports | | | | |
| Permissions | | | | |
| **TOTAL** | | | | |

---

*Generated: 2026-04-15*
*Last verified: 2026-04-28*
