# Journal Entry (JV) Rules

Hard guardrails for JV creation, reversal, and GL resolution. These rules are non-negotiable.

---

## Core Principles

1. **Approved = JV created. Always. No exceptions.** No migration, bulk upload, historical, or admin tool may skip JV.
2. **JVs are never deleted** — only reversed (new JV with flipped DR/CR).
3. **Every JV must balance** — total debits = total credits (0.5 cent tolerance for rounding).
4. **Every JV must have a valid source** — `source_type` + `source_id` link back to the originating record.
5. **Idempotency guard** — before creating, check if a posted JV already exists for the same `source_type` + `source_id`.
6. **GL prerequisites must be validated BEFORE creating records** — block the action with a clear error if GL is missing.

---

## JV Source Types

| source_type | Trigger | source_id | Debit | Credit |
|-------------|---------|-----------|-------|--------|
| `claim_approval` | Accountant approves claim/mileage | claim.id | Expense GL | Staff Claims Payable GL |
| `invoice_posting` | Accountant approves purchase invoice | invoice.id | Expense GL (or line-item GLs) | Trade Payables GL |
| `sales_invoice_posting` | Accountant approves sales invoice | sales_invoice.id | Trade Receivables GL | Revenue GL |
| `bank_recon` | Bank transaction matched/confirmed | bank_transaction.id | Varies by transaction type (see below) |
| `year_end_close` | Fiscal year closed | fiscal_year.id | Revenue/Expense accounts → Retained Earnings |

### Bank Recon JV Details

Bank recon JVs vary by what the transaction is matched to:

| Match Type | Debit | Credit |
|------------|-------|--------|
| **Payment Voucher** (debit txn → invoice) | Expense/Payables GL | Bank Account GL |
| **Official Receipt** (credit txn → sales invoice) | Bank Account GL | Revenue/Receivables GL |
| **Claim Reimbursement** (debit txn → claim) | Staff Claims Payable GL | Bank Account GL |

---

## GL Resolution Order

GL accounts are resolved in priority order. First match wins.

### Purchase Invoice Approval
1. User-selected GL in approval modal
2. Invoice's `gl_account_id` (set during upload/edit)
3. Supplier's `default_gl_account_id`
4. Firm's `default_trade_payables_gl_id` (for contra)

### Invoice with Line Items (Multi-GL)
- Each `InvoiceLine` has its own `gl_account_id` → creates multiple debit lines
- Single contra credit to Trade Payables GL
- Line totals must sum to invoice total

### Sales Invoice Approval
1. User-selected Revenue GL
2. Invoice's `gl_account_id`
3. Firm default (for contra: Trade Receivables)

### Claim/Mileage Approval
1. Claim's `gl_account_id` (explicit GL on record)
2. Firm's `default_staff_claims_gl_id` (for contra)

### Bank Reconciliation
1. Bank Account's mapped GL (`BankAccount.gl_account_id`) — **required, block if missing**
2. For expense side: User-selected GL → category override GL → firm default GL

### GL Auto-Suggest (Inline Assistance)
Multi-level suggestion system for pre-filling GL fields:
1. Supplier's `default_gl_account_id`
2. Supplier alias lookup → parent supplier GL
3. Vendor name fuzzy match against GL account names
4. Firm default GL

---

## GL Prerequisite Validation

**Every action that posts a JV must validate GL accounts BEFORE proceeding.**

| Action | Required GLs | Error if Missing |
|--------|-------------|------------------|
| Invoice approval | Expense GL + Contra GL (Trade Payables) | "Invoice has no GL account. Select one before approving." |
| Sales invoice approval | Revenue GL + Contra GL (Trade Receivables) | "Sales invoice has no GL account assigned." |
| Bank recon match (payment voucher) | Bank GL + Expense GL | "Bank account '{name}' has no GL account mapped. Go to Bank Recon → Manage Accounts." |
| Bank recon match (official receipt) | Bank GL + Income GL | Same as above |
| Bank recon match (claim) | Bank GL + Claims Payable GL | Same as above |
| Claim approval | Expense GL + Contra GL | "Claim has no GL account. Select one before approving." |

**Error messages must tell the user exactly what's missing and where to fix it.**

---

## JV Reversal Mechanics

### How Reversal Works
1. Fetch original JV and validate it's not already reversed
2. Determine posting date:
   - Try original JV's posting date first
   - Fallback to today if no open period for original date
   - Create JV even without open period (period assigned later)
3. Create reversal JV:
   - New voucher number: `JV-YYYY-NNNN` (auto-incremented)
   - Description: `"Reversal of {original_voucher}"`
   - Lines: DR/CR amounts flipped from original
   - Bidirectional link: `reversed_by_id` ↔ `reversal_of_id`
   - Both JVs stay `status: 'posted'` (they cancel out in GL)
4. Audit log the reversal

### Source-Based Reversal
`reverseJVsForSource(sourceType, sourceId)` — finds all posted JVs matching source and reverses each one.

Used by:
- Claim delete/revert → `reverseJVsForSource('claim_approval', claimId)`
- Invoice delete/revert → `reverseJVsForSource('invoice_posting', invoiceId)`
- Bank unmatch → `reverseJVsForSource('bank_recon', bankTransactionId)`
- FY reopen → `reverseJVsForSource('year_end_close', fiscalYearId)`
- Sales invoice revert → `reverseJVsForSource('sales_invoice_posting', salesInvoiceId)`

### When Reversals Happen
| User Action | JV Reversed |
|-------------|------------|
| Delete approved claim | `claim_approval` + `bank_recon` (if bank-matched) |
| Revert claim approval | `claim_approval` |
| Edit approved claim | `claim_approval` (auto-revert approval first) |
| Delete approved invoice | `invoice_posting` |
| Revert invoice approval | `invoice_posting` |
| Unmatch bank transaction | `bank_recon` |
| Delete bank statement | `bank_recon` (all transactions in statement) |
| Reopen fiscal year | `year_end_close` |

---

## Voucher Numbering

- Format: `JV-YYYY-NNNN` (e.g., `JV-2026-0001`)
- Year-scoped per firm (resets to 0001 each year per firm)
- Auto-incremented: finds max voucher number for firm+year, adds 1
- Unique per firm (not globally unique)

---

## Year-End Closing JV

When a fiscal year is closed:
1. Ensure last period is open for posting
2. Sum all Revenue and Expense account balances within the FY date range
3. Create closing JV:
   - **Debit** each Revenue account (zeroing it out)
   - **Credit** each Expense account (zeroing it out)
   - **Net difference** posted to Retained Earnings GL
4. Source: `year_end_close`, source_id: fiscal year ID
5. Idempotency: only one closing JV per FY (checks before creating)

Reopening reverses this JV and reopens all non-locked periods.

---

## Double-Entry Validation

Every JV is validated at creation:
- Sum of all debit amounts must equal sum of all credit amounts
- Tolerance: 0.5 cents (for floating-point rounding in multi-line JVs)
- If imbalanced: JV creation is blocked with error

---

## Critical Anti-Patterns (NEVER DO)

| Anti-Pattern | Why It's Wrong |
|-------------|----------------|
| Skip JV for "historical" or "migration" records | Breaks GL accuracy. Approved = JV. Always. |
| Hard-delete a JournalEntry row | Destroys audit trail. Always reverse instead. |
| Create JV without checking GL prerequisites | Leads to JVs with null GL accounts, breaks reports |
| Use `firmIds ?? []` in JV queries | Super-admin (null) would see zero JVs instead of all |
| Create JV without idempotency check | Duplicate JVs for same source corrupt the GL |
| Reverse a JV that's already reversed | Check `reversed_by_id` before reversing |
