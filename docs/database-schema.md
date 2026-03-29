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
| created_at | DateTime | |
| updated_at | DateTime | |

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

## Key Relationships
firms ← employees (many per firm)
firms ← categories (many per firm)
firms ← users (many per firm, except accountants)
employees ← claims (many per employee)
categories ← claims (many per category)
users (admin) ← receipts (many per admin)
