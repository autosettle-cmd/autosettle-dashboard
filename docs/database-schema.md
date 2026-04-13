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
| default_trade_payables_gl_id | UUID FK? | GL default for AP |
| default_staff_claims_gl_id | UUID FK? | GL default for claims |
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
| file_url, thumbnail_url | String? | Google Drive links |
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

### Supplier
| Field | Type | Notes |
|-------|------|-------|
| id | UUID PK | |
| firm_id | UUID FK | |
| name | String | |
| is_active | Boolean | Soft delete |
| LHDN buyer fields | Various | tin, brn, address |

### SupplierAlias
Maps variant vendor names to single supplier (OCR matching).

### Payment
| Field | Type | Notes |
|-------|------|-------|
| firm_id, supplier_id?, employee_id? | UUID FK | |
| amount | Decimal(10,2) | |
| payment_date | Date | |
| direction | Enum | outgoing / incoming |

### PaymentAllocation
Links Payment to Invoice. Triggers `recalcInvoicePayment()`.

### PaymentReceipt
Links Payment to Claim (type=receipt). For attaching receipt proof.

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
| source_type | Enum | claim_approval / invoice_posting / bank_recon / manual |
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

---

## Bank Reconciliation

### BankStatement
| Field | Type | Notes |
|-------|------|-------|
| firm_id | UUID FK | |
| bank_name | String | |
| statement_date | Date | |
| file_hash | String UNIQUE | Dedup check |
| opening_balance, closing_balance | Decimal(12,2)? | |

### BankTransaction
| Field | Type | Notes |
|-------|------|-------|
| bank_statement_id | UUID FK | CASCADE delete |
| transaction_date | Date | |
| description | String | |
| debit, credit | Decimal(12,2)? | |
| recon_status | Enum | unmatched / matched / manually_matched / excluded |
| matched_payment_id | UUID FK? | |

### BankAccount
Maps bank accounts to GL accounts for JV posting.

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

### MessageLog
Logs all WhatsApp messages for debugging.

---

## Key Relationships

```
Firm ← User, Employee, Category, Supplier, Invoice, Claim, GLAccount, JournalEntry
Employee ← Claim, User
Supplier ← Invoice, Payment, SupplierAlias
Payment ← PaymentAllocation → Invoice
Payment ← PaymentReceipt → Claim
JournalEntry ← JournalLine → GLAccount
FiscalYear ← Period ← JournalEntry
BankStatement ← BankTransaction → Payment
```
