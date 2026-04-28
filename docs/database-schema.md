# Autosettle Database Schema

PostgreSQL hosted on VPS. Managed via Prisma ORM.
All tables use UUID primary keys. All timestamps are UTC.

Schema source: `/prisma/schema.prisma`

---

## Core Entities

### Firm
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| name | String | Company name |
| registration_number | String? | SSM number |
| contact_email, contact_phone | String? | |
| is_active | Boolean | Default true |
| plan | Enum | free / paid |
| mileage_rate_per_km | Decimal(4,2)? | RM per km, default 0.55 |
| receipt_count | Int | Default 0, tracks usage |
| default_trade_payables_gl_id | UUID FK? | GL default for AP |
| default_staff_claims_gl_id | UUID FK? | GL default for claims |
| default_trade_receivables_gl_id | UUID FK? | GL default for AR |
| default_retained_earnings_gl_id | UUID FK? | GL default for year-end close |
| drive_*_folder_id | String? | Google Drive folders |
| LHDN fields | Various | tin, brn, msic_code, sst, address |

### User
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| email | String UNIQUE | Login credential |
| password_hash | String | bcrypt hashed |
| name | String | |
| role | Enum | accountant / admin / employee / platform_owner |
| status | Enum | active / pending_onboarding / rejected / inactive |
| firm_id | UUID FK? | NULL for accountants |
| employee_id | UUID FK? | Links to Employee record |

### Employee
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| name | String | |
| phone | String UNIQUE | WhatsApp number |
| email | String? | For dashboard login |
| firm_id | UUID FK | |
| is_active | Boolean | |

### AccountantFirm
Maps accountants to their assigned firms. Zero assignments = sees all firms.

| Field | Type | Notes |
|-------|------|-------|
| user_id | UUID FK | |
| firm_id | UUID FK | |
| @@unique | [user_id, firm_id] | |

---

## Claims & Receipts

### Claim
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id, employee_id | UUID FK | |
| claim_date | Date | Date on receipt |
| merchant | String | |
| amount | Decimal(10,2) | |
| category_id | UUID FK | |
| type | Enum | claim / receipt / mileage |
| status | Enum | pending_review / reviewed |
| approval | Enum | pending_approval / approved / not_approved |
| payment_status | Enum | unpaid / partially_paid / paid |
| amount_paid | Decimal(10,2) | Default 0 |
| gl_account_id | UUID FK? | Expense GL |
| contra_gl_account_id | UUID FK? | Staff Claims Payable GL |
| file_url, file_download_url, thumbnail_url | String? | Google Drive links |
| matched_bank_txn_id | UUID FK? | Direct bank transaction link (for reimbursement) |
| file_hash | String? | Dedup check |
| Mileage fields | | from_location, to_location, distance_km, trip_purpose |

**Indexes:** (firm_id, type, claim_date), (firm_id, approval), (firm_id, payment_status)

---

## Invoices & Payments

### Invoice (Purchase)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id, uploaded_by | UUID FK | |
| supplier_id | UUID FK? | |
| supplier_link_status | Enum | auto_matched / unmatched / confirmed |
| vendor_name_raw | String | OCR-extracted name |
| invoice_number | String? | |
| issue_date, due_date | Date | |
| total_amount | Decimal(10,2) | |
| payment_status | Enum | unpaid / partially_paid / paid |
| amount_paid | Decimal(10,2) | |
| approval | Enum | pending_approval / approved / not_approved |
| gl_account_id | UUID FK? | |

### SalesInvoice (Issued)
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id, supplier_id (buyer) | UUID FK | |
| invoice_number | String UNIQUE per firm | |
| total_amount | Decimal(10,2) | |
| payment_status | Enum | |
| lhdn_* fields | Various | MyInvois integration |

### InvoiceLine
Optional line items per invoice for mixed-GL scenarios (reimbursement, pay-on-behalf).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| invoice_id | UUID FK | CASCADE delete |
| description | String | |
| quantity | Decimal(10,3) | Default 1 |
| unit_price | Decimal(10,2) | |
| tax_amount | Decimal(10,2) | Default 0 |
| line_total | Decimal(10,2) | |
| gl_account_id | UUID FK? | Per-line expense GL |
| sort_order | Int | Default 0 |

When lines exist, JV creates multiple debit entries (one per line GL).

### Supplier
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id | UUID FK | |
| name | String | |
| is_active | Boolean | Soft delete |
| default_gl_account_id | UUID FK? | Auto-fill on invoices (learned on first approval) |
| default_contra_gl_account_id | UUID FK? | Auto-fill contra GL (overwritten each approval) |
| LHDN buyer fields | Various | tin, brn, address |

### SupplierAlias
Maps variant vendor names to single supplier (OCR matching). CASCADE delete with parent Supplier.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| supplier_id | UUID FK | CASCADE delete |
| alias | String | Normalized vendor name from OCR (`toLowerCase().trim()`) |
| is_confirmed | Boolean | Default false; true when accountant/admin confirms |

### Payment
Bridge entity between bank transactions and invoices/claims.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id, supplier_id?, employee_id? | UUID FK | |
| amount | Decimal(10,2) | |
| payment_date | Date | |
| direction | Enum | outgoing / incoming |
| notes | String? | "Auto-matched from receipt" for auto-created |

### PaymentAllocation
Links Payment to Invoice. CASCADE delete with either side. Triggers `recalcInvoicePaid()`.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| payment_id | UUID FK | CASCADE delete |
| invoice_id | UUID FK | CASCADE delete |
| amount | Decimal(10,2) | |

### PaymentReceipt
Links Payment to Claim. CASCADE delete with either side.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| payment_id | UUID FK | CASCADE delete |
| claim_id | UUID FK | CASCADE delete |
| amount | Decimal(10,2) | |

### SalesPaymentAllocation
Links Payment to SalesInvoice. CASCADE delete with either side.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| payment_id | UUID FK | CASCADE delete |
| sales_invoice_id | UUID FK | CASCADE delete |
| amount | Decimal(10,2) | |

### SalesInvoiceItem
Line items for sales invoices. CASCADE delete with parent.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| sales_invoice_id | UUID FK | CASCADE delete |
| description | String | |
| quantity | Decimal(10,3) | |
| unit_price | Decimal(10,2) | |
| discount | Decimal(10,2) | Default 0 |
| tax_type | String? | |
| tax_amount | Decimal(10,2) | Default 0 |
| line_total | Decimal(10,2) | |
| sort_order | Int | Default 0 |

**Indexes:** SalesInvoiceItem(sales_invoice_id)

---

## Accounting Foundation

### GLAccount (Chart of Accounts)
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| account_code | String | e.g., "1100" |
| name | String | |
| account_type | Enum | Asset / Liability / Equity / Revenue / Expense |
| normal_balance | Enum | Debit / Credit |
| parent_id | UUID FK? | Hierarchical structure |
| is_active | Boolean | Soft delete |
| is_system | Boolean | Protected accounts |

### JournalEntry
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| voucher_number | String UNIQUE per firm | Auto-generated |
| posting_date | Date | |
| period_id | UUID FK | Must be open period |
| source_type | Enum | claim_approval / invoice_posting / sales_invoice_posting / bank_recon / year_end_close / manual |
| created_by | String? | User who created |
| source_id | String? | Links to source record |
| status | Enum | posted / reversed |
| reversed_by_id | UUID FK? | Links to reversal JV |

### JournalLine
| Field | Type | Notes |
|-------|------|-------|
| journal_entry_id | UUID FK | CASCADE delete |
| gl_account_id | UUID FK | |
| debit_amount | Decimal(12,2) | |
| credit_amount | Decimal(12,2) | |

**Constraint:** Total debits must equal total credits per JournalEntry.

### FiscalYear
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| year_label | String | e.g., "FY2026" |
| start_date, end_date | Date | |
| status | Enum | open / closed |

### Period
| Field | Type | Notes |
|-------|------|-------|
| fiscal_year_id | UUID FK | |
| period_number | Int | 1-12 |
| status | Enum | open / closed / locked |

**Indexes:** Period(start_date, end_date)

---

## Bank Reconciliation

### BankStatement
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| bank_name | String | |
| account_number | String? | Bank account number |
| statement_date | Date | |
| period_start, period_end | Date? | Statement period range |
| file_hash | String UNIQUE | Dedup check |
| opening_balance, closing_balance | Decimal(12,2)? | |
| verification_issues | Json? | Stored verification result from upload-time checks |
| balance_override | Boolean (false) | User acknowledged balance mismatch |
| balance_override_by | String? | User ID who overrode |
| balance_override_at | DateTime? | When override was set |
| deleted_at | DateTime? | Soft-delete timestamp (30-day grace) |
| deleted_by | String? | User ID who soft-deleted |

### BankTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| bank_statement_id | UUID FK | CASCADE delete |
| transaction_date | Date | |
| description | String | |
| debit, credit | Decimal(12,2)? | |
| recon_status | Enum | unmatched / matched / manually_matched / excluded |
| matched_payment_id | UUID FK? | Legacy payment link |
| matched_sales_invoice_id | UUID FK? | Direct sales invoice match |
| matched_at, matched_by | DateTime?, String? | Match audit |

### BankTransactionInvoice
Links bank transaction to purchase invoice(s) for allocation. CASCADE delete with either side.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| bank_transaction_id | UUID FK | CASCADE delete |
| invoice_id | UUID FK | CASCADE delete |
| amount | Decimal(12,2) | Allocated amount |

### BankTransactionClaim
Links bank transaction to claim for reimbursement. CASCADE delete with either side.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| bank_transaction_id | UUID FK | CASCADE delete |
| claim_id | UUID FK | CASCADE delete |
| amount | Decimal(12,2) | Allocated amount |

### InvoiceReceiptLink
Links claim (receipt) to invoice for aging/payment tracking. CASCADE delete with either side.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| invoice_id | UUID FK | CASCADE delete |
| claim_id | UUID FK | CASCADE delete |
| amount | Decimal(10,2) | Receipt amount applied |

### BankAccount
Maps bank accounts to GL accounts for JV posting. Required for bank recon JVs.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id | UUID FK | |
| bank_name | String | |
| account_number | String | |
| gl_account_id | UUID FK | **Required** — blocks bank recon if missing |

---

## Supporting Tables

### Category
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK? | NULL = global default |
| name | String | |
| is_active | Boolean | |

### CategoryFirmOverride
Per-firm enable/disable of global categories + GL mapping.

### TaxCode
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| code | String | e.g., "SR-6" |
| rate | Decimal(5,2) | |
| gl_account_id | UUID FK? | |

### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| firm_id | String | |
| table_name, record_id | String | |
| action | Enum | create / update / delete |
| changed_fields, old_values, new_values | JSON? | |
| user_id, user_name | String? | |
| timestamp | DateTime | |

### Session (WhatsApp)
Tracks WhatsApp conversation state for multi-step flows.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| phone | String UNIQUE | WhatsApp number |
| state | String | IDLE / COLLECTING |
| step | String? | Current step in flow |
| intent | String? | receipt / invoice / mileage |
| pending_receipt | JSON? | Buffered data during multi-step |

### MessageLog
Logs all WhatsApp messages for debugging.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| phone | String | Sender phone |
| employee_id | String? FK | |
| direction | String | inbound / outbound |
| message_type | String | text / image / document |
| body | String? | Message content |
| media_url | String? | |
| created_at | DateTime | |

**Indexes:** MessageLog(received_at)

### OcrLog
Tracks OCR processing results for analytics and debugging.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id | String FK | |
| file_name | String | |
| document_type | String | receipt / invoice |
| confidence | String? | HIGH / MEDIUM / LOW |
| success | Boolean | |
| error_message | String? | |
| processing_ms | Int? | Processing time |
| source | String | whatsapp / dashboard |
| created_at | DateTime | |

---

## Key Relationships

```
Firm ← User, Employee, Category, Supplier, Invoice, Claim, GLAccount, JournalEntry, BankStatement, SalesInvoice
Employee ← Claim, User
Supplier ← Invoice, SalesInvoice, Payment, SupplierAlias (cascade)
Invoice ← InvoiceLine (cascade), PaymentAllocation (cascade), BankTransactionInvoice (cascade), InvoiceReceiptLink (cascade)
SalesInvoice ← SalesInvoiceItem (cascade), SalesPaymentAllocation (cascade)
Claim ← PaymentReceipt (cascade), InvoiceReceiptLink (cascade), BankTransactionClaim (cascade)
Payment ← PaymentAllocation (cascade), PaymentReceipt (cascade), SalesPaymentAllocation (cascade)
JournalEntry ← JournalLine (cascade) → GLAccount
JournalEntry ↔ JournalEntry (reversed_by_id / reversal_of_id)
FiscalYear ← Period ← JournalEntry
BankStatement ← BankTransaction (cascade) ← BankTransactionInvoice (cascade), BankTransactionClaim (cascade)
```

## amount_paid Calculation

| Entity | Formula | Recalc Function |
|--------|---------|-----------------|
| Invoice | `MAX(SUM(InvoiceReceiptLink.amount), SUM(BankTransactionInvoice.amount))` | `recalcInvoicePaid()` |
| Claim | `SUM(PaymentReceipt.amount) + SUM(InvoiceReceiptLink.amount)` | `recalcClaimPayment()` |
| SalesInvoice | `SUM(SalesPaymentAllocation.amount)` | Direct update |

See [`/docs/entity-cascade.md`](/docs/entity-cascade.md) for full cascade and delete rules.
See [`/docs/jv-rules.md`](/docs/jv-rules.md) for JV creation and reversal rules.

Last verified: 2026-04-28
