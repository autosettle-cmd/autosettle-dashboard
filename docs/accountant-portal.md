# Autosettle — Accountant Portal Spec

## Design Principle
Built like a spreadsheet, not a form. The accountant lives in the table.

## Tech Component
Use AG Grid (free community version) for the main claims table.
Install: npm install ag-grid-react ag-grid-community

---

## Screen 1: Login Page
- Email + password login
- Autosettle logo centered, dark navy background
- On successful login → redirect to /accountant/dashboard
- Wrong role accessing accountant route → redirect to their correct portal

---
## Screen 2: Main Dashboard (Overview)
Top summary bar — 4 stat cards:
- Total claims this month
- Pending approval (all firms)
- Approved this month
- Rejected this month

Firm switcher:
- Dropdown listing all firms the accountant manages
- Default: show all firms combined
- Selecting a firm filters entire dashboard to that firm

Quick action banner:
- If pending claims exist: "You have X claims pending approval" + Jump to Claims button

---

## Screen 3: Claims Table (Core Feature)

Table columns (in order):
| Column     | Type       | Notes                                  |
|------------|------------|----------------------------------------|
| Checkbox   | Selection  | Select individual or all               |
| Date       | Date       | Sortable, default newest first         |
| Employee   | Text       | Name of submitter                      |
| Firm       | Text       | Hidden if firm filter is active        |
| Merchant   | Text       | Extracted supplier name                |
| Category   | Text       | Editable inline                        |
| Amount (RM)| Number     | Right-aligned, 2 decimal places        |
| Status     | Badge      | pending_review / reviewed              |
| Approval   | Badge      | pending_approval / approved / not_approved |
| Receipt    | Icon button| Opens receipt preview panel            |

Sticky columns: Checkbox, Employee, Amount always visible on scroll.

Filtering bar (above table):
- Firm dropdown (all or specific)
- Date range picker (this week / this month / custom)
- Status filter (Pending review / Reviewed / All)
- Approval filter (Pending / Approved / Not approved / All)
- Category filter (multi-select)
- Search box (searches merchant name and employee name)

Batch action bar (appears when rows are selected):
- Shows count: "47 claims selected"
- Approve button → confirmation modal → PATCH /api/claims/batch
- Reject button → modal with optional reason → PATCH /api/claims/batch
- Clear selection button
- Bar disappears when no rows selected
- Fixed bottom center, #152237 background, slides up with 0.2s animation

Pagination:
- 50 rows per page default
- Show: "Showing 1–50 of 234 claims"

Export button:
- Top right of table
- Exports current filtered view to .xlsx
- Filename: autosettle-claims-{firm}-{date}.xlsx

---

## Screen 4: Receipt Preview Panel
Slides in from right (420px wide) when accountant clicks receipt icon. Does not navigate away.

Panel contents:
- Receipt image (from Google Drive thumbnail URL)
- All editable fields: Date, Merchant, Amount, Category, Invoice/Receipt No
- Confidence score (read only — informational)
- Status badges
- Save button (saves edits, does NOT reset approval status when accountant edits)
- Approve button
- Reject button (with reason field)
- Close button (X)
- Link to open original image in new tab

Edit behaviour by role:
- Accountant edits → saves directly, approval status unchanged
- Admin edits → saves AND resets to pending_review + pending_approval (needs re-review)

---

## Screen 5: Clients Management Page
Table columns: Firm name, Active employees count, Total claims this month, Pending claims, Date onboarded
Actions per row: View firm details, View all claims for this firm (pre-filtered)

---

## Screen 6: Employee Management Page
Table columns: Employee name, Phone, Firm, Total claims submitted, Total approved amount, Status (Active/Inactive)

---

## Screen 7: Category Management Page
See /docs/categories-spec.md for full category logic.

---

## Batch Approve Technical Note
- Fire one PATCH per selected record in parallel using Promise.all()
- At 200+ records: chunk into batches of 20
- All PATCH calls go through /api/claims/batch — never directly from browser
- Approval field values: "approved" or "not_approved"

---

## Design Rules
- Status badges: pending_review=yellow, reviewed=blue, approved=green, not_approved=red, paid=purple
- Confirmation modal must show count before confirming ("Approve 47 claims?")
- Mobile: table collapses to card view on screens under 768px
- See /docs/design-system.md for all colors, spacing, and component specs

---

## Open Questions (decide before building)
- [ ] Can accountant edit the Amount field inline, or read-only?
- [ ] When claim is rejected, is employee notified via WhatsApp automatically?
- [ ] Does accountant see Confidence score column or is it hidden?