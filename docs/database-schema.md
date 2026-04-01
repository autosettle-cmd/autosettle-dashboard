# Autosettle — Postgres Database Schema

## Overview
Postgres hosted on VPS alongside n8n. Managed via Prisma ORM.
All tables use UUID primary keys. All timestamps are UTC.

---

## Table: users
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | Auto-generated |
| email | String UNIQUE | Login credential |
| password_hash | String | bcrypt hashed, never plain text |
| name | String | Display name |
| role | Enum | accountant / admin / employee |
| firm_id | UUID FK → firms | NULL for accountants |
| employee_id | UUID FK → employees | NULL unless role=employee |
| is_active | Boolean | Default true |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

---

## Table: firms
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | String | Company name |
| registration_number | String? | Optional SSM number |
| contact_email | String? | |
| contact_phone | String? | |
| is_active | Boolean | Default true |
| receipt_count | Int | Free tier tracking, cap at 500 |
| plan | Enum | free / paid |
| mileage_rate_per_km | Decimal(4,2)? | RM per km for mileage claims. Default fallback: 0.55 (LHDN standard) |
| created_at | DateTime | |
| updated_at | DateTime | |

---

## Table: employees
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | String | |
| phone | String UNIQUE | WhatsApp number e.g. 60123456789 |
| email | String? | Needed for dashboard login |
| firm_id | UUID FK → firms | |
| is_active | Boolean | Default true |
| created_at | DateTime | |
| updated_at | DateTime | |

---

## Table: claims
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | Denormalised for fast filtering |
| employee_id | UUID FK → employees | |
| claim_date | Date | Date on the receipt |
| merchant | String | |
| description | String? | |
| receipt_number | String? | |
| amount | Decimal(10,2) | Always MYR |
| category_id | UUID FK → categories | |
| confidence | Enum | HIGH / MEDIUM / LOW |
| status | Enum | pending_review / reviewed |
| approval | Enum | pending_approval / approved / not_approved |
| payment_status | Enum | unpaid / paid |
| rejection_reason | String? | |
| file_url | String? | Google Drive view link |
| file_download_url | String? | |
| thumbnail_url | String? | |
| submitted_via | Enum | whatsapp / dashboard |
| type | Enum | claim / receipt / mileage. Default: claim |
| from_location | String? | Mileage only: trip start location |
| to_location | String? | Mileage only: trip end location |
| distance_km | Decimal(8,2)? | Mileage only: km traveled |
| trip_purpose | String? | Mileage only: reason for trip |
| created_at | DateTime | |
| updated_at | DateTime | |

Indexes:
- `(firm_id, type, claim_date)` — tab filtering + date range queries
- `(firm_id, type, status)` — pending review queries
- `(firm_id, claim_date)` — date-range-only queries

Claim types:
- `claim` — standard employee expense claim (receipt photo required)
- `receipt` — payment receipt proof uploaded by admin
- `mileage` — distance-based claim, no receipt. Amount auto-calculated: distance_km × firm mileage rate (default RM 0.55/km). merchant is always "Mileage Claim", category auto-set to "Travel & Transport"

Status flow:
pending_review → reviewed (Admin action)
pending_approval → approved OR not_approved (Accountant action)
unpaid → paid (Accountant action)

---

## Table: receipts
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | |
| uploaded_by | UUID FK → users | |
| receipt_date | Date | |
| merchant | String | |
| receipt_number | String? | |
| amount | Decimal(10,2) | |
| category_id | UUID FK → categories | |
| confidence | Enum | HIGH / MEDIUM / LOW |
| approval | Enum | pending_approval / approved / not_approved |
| file_url | String? | |
| file_download_url | String? | |
| thumbnail_url | String? | |
| submitted_via | Enum | whatsapp / dashboard |
| created_at | DateTime | |
| updated_at | DateTime | |

---

## Table: categories
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | Per firm |
| name | String | e.g. Petrol, Medical, Parking |
| tax_code | String? | Malaysian tax relief code |
| is_active | Boolean | Default true |
| created_at | DateTime | |

Unique constraint: (firm_id, name)

---

## Table: sessions
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| phone | String UNIQUE | WhatsApp number |
| state | Enum | IDLE / COLLECTING |
| step | String? | AWAITING_CONFIRMATION / AWAITING_CORRECTION |
| intent | String? | |
| pending_receipt | JSON? | Held during correction flow |
| created_at | DateTime | |
| updated_at | DateTime | |

Cleanup: Sessions older than 24 hours with state=COLLECTING auto-deleted by scheduled job.

---

## Table: suppliers
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | Firm-scoped |
| name | String | Display name for the supplier account |
| contact_email | String? | |
| contact_phone | String? | |
| notes | String? | |
| is_active | Boolean | Default true |
| created_at | DateTime | |
| updated_at | DateTime | |

Unique constraint: (firm_id, name)

---

## Table: supplier_aliases
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| supplier_id | UUID FK → suppliers | |
| alias | String | Lowercase normalized vendor name from OCR |
| is_confirmed | Boolean | Default false. True = admin verified, future auto-confirm |
| created_at | DateTime | |

Unique constraint: (supplier_id, alias)

Maps variant vendor names to a single supplier account (e.g. "mcdonalds", "the golden arch" → McDonald's Corp).

---

## Table: invoices
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | |
| uploaded_by | UUID FK → employees | Admin who uploaded |
| supplier_id | UUID FK → suppliers | Nullable until linked |
| supplier_link_status | Enum | auto_matched / unmatched / confirmed |
| vendor_name_raw | String | Original OCR-extracted vendor name |
| invoice_number | String? | |
| issue_date | Date | |
| due_date | Date? | Calculated from payment_terms if not explicit |
| payment_terms | String? | e.g. "Net 30", "30 Days" |
| subtotal | Decimal(10,2)? | |
| tax_amount | Decimal(10,2)? | |
| total_amount | Decimal(10,2) | Total payable |
| category_id | UUID FK → categories | |
| confidence | Enum | HIGH / MEDIUM / LOW |
| status | Enum | pending_review / reviewed |
| payment_status | Enum | unpaid / partially_paid / paid |
| amount_paid | Decimal(10,2) | Default 0. Auto-updates payment_status |
| file_url | String? | Google Drive view link |
| file_download_url | String? | |
| thumbnail_url | String? | |
| submitted_via | Enum | whatsapp / dashboard |
| created_at | DateTime | |
| updated_at | DateTime | |

Indexes:
- `(firm_id, status)` — pending invoice queries
- `(firm_id, issue_date)` — monthly invoice queries

Supplier link flow:
- unmatched → new supplier auto-created, needs admin confirmation
- auto_matched → existing alias found (unconfirmed), needs admin confirmation
- confirmed → admin verified, alias marked is_confirmed=true for future auto-match

Payment status flow:
- unpaid → partially_paid (when amount_paid > 0 but < total_amount)
- partially_paid → paid (when amount_paid >= total_amount)

Aging report: Derived from invoices where payment_status != 'paid'. Buckets calculated from due_date relative to today: Current (not yet due), 1-30, 31-60, 61-90, 90+ days overdue. Grouped by supplier_id. API: GET /api/admin/invoices/aging. Displayed on /admin/suppliers page above the supplier list.

---

## Table: payments
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firm_id | UUID FK → firms | |
| supplier_id | UUID FK → suppliers | |
| amount | Decimal(10,2) | Total payment amount |
| payment_date | Date | |
| reference | String? | Cheque number, transfer ref, etc. |
| notes | String? | |
| created_at | DateTime | |

Supplier credit = SUM(payment.amount) - SUM(payment_allocations.amount) per supplier. Not stored — computed on the fly. Shown as green "Credit" badge on supplier list. "Apply Credit" button allocates excess to oldest unpaid invoices.

---

## Table: payment_allocations
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| payment_id | UUID FK → payments | |
| invoice_id | UUID FK → invoices | |
| amount | Decimal(10,2) | Amount of this payment allocated to this invoice |

Unique constraint: (payment_id, invoice_id). One allocation per payment-invoice pair.
After creation, `recalcInvoicePayment()` updates invoice.amount_paid and payment_status.

---

## Table: payment_receipts
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| payment_id | UUID FK → payments | |
| claim_id | UUID FK → claims | Must be type=receipt |

Unique constraint: (payment_id, claim_id). Links payment proof documents (receipts) to payments. Many-to-many: one payment can have multiple receipts attached.

---

## Key Relationships
firms ← employees (many per firm)
firms ← categories (many per firm)
firms ← users (many per firm, except accountants)
employees ← claims (many per employee)
categories ← claims (many per category)
users (admin) ← receipts (many per admin)
firms ← suppliers (many per firm)
suppliers ← supplier_aliases (many per supplier)
suppliers ← invoices (many per supplier)
suppliers ← payments (many per supplier)
payments ← payment_allocations (many per payment) → invoices
payments ← payment_receipts (many per payment) → claims (type=receipt)
employees (admin) ← invoices (many per admin uploader)
