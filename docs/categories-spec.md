# Autosettle — Categories Spec

## Two Types of Categories

### Default Categories (Global)
Apply to ALL firms automatically. Pre-seeded into the database.
Only accountant can add/edit/deactivate defaults.

Full list:
- Advertising & Marketing
- Automotive
- Bank & Finance
- Communication
- Equipment & Hardware
- Insurance
- Meals & Entertainment
- Merchandise & Inventory
- Office Expenses
- Professional Services
- Rent & Facilities
- Repairs & Maintenance
- Software & SaaS
- Staff Welfare
- Taxes & Licenses
- Training & Education
- Travel & Transport
- Utilities
- Miscellaneous

### Firm-Specific Categories (Custom)
Added manually per firm. Only visible to that firm.
Both accountant AND admin can add/edit/deactivate custom categories.

---

## Permissions
| Action                                    | Accountant | Admin          |
|------------------------------------------|------------|----------------|
| Add default category                      | Yes        | No             |
| Edit default category                     | Yes        | No             |
| Deactivate default for ALL firms          | Yes        | No             |
| Deactivate default for their firm only    | Yes        | Yes            |
| Add firm-specific category                | Yes        | Yes (own firm) |
| Edit firm-specific category               | Yes        | Yes (own firm) |
| Deactivate firm-specific category         | Yes        | Yes (own firm) |

---

## Employee View
When employee submits a claim, they see:
- All active default categories
- All active firm-specific categories for their firm
- Combined in one dropdown, sorted alphabetically

---

## Database Implementation
Category table: firm_id nullable
- firm_id = NULL → default category (global)
- firm_id = specific firm → firm-specific

For per-firm deactivation of defaults, use CategoryFirmOverride table:
- id UUID
- category_id FK → Category
- firm_id FK → Firm
- is_active Boolean
- created_at DateTime
- Unique constraint on (category_id, firm_id)

Fetch logic for a firm:
1. Get all default categories (firm_id = NULL)
2. Check CategoryFirmOverride — if override exists, use that is_active
3. Get firm-specific categories (firm_id = this firm)
4. Combine and return active only

---

## Seed Data
All 19 default categories must be seeded in prisma/seed.ts with firm_id = null, is_active = true.