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

---

## Screen 8: Claims Page — Tabbed (Built 2026-03-31)

Two tabs with count badges:
- **Employee Claims** (type=claim): Date, Employee, Firm, Merchant, Category, Amount, Status, Approval
- **Receipts** (type=receipt): Date, Firm, Merchant, Category, Amount, Status, Payment, Linked

Receipt preview panel shows linked payment info (supplier, amount, date, reference) with "Unlink from Payment" button.

---

## Screen 9: Invoices Page (Built 2026-03-31)

AG Grid with columns: Date, Vendor, Invoice #, Due Date, Amount, Paid, Payment Status, Supplier Link.
Row click → preview panel with Edit + Mark as Reviewed.

---

## Screen 10: Suppliers Page (Built 2026-03-31)

Two sections:
1. **Aging Report** — 6 summary cards (Current, 1-30, 31-60, 61-90, 90+, Total) + collapsible table grouped by supplier with invoice drill-down. Invoice rows clickable → preview panel.
2. **Supplier Accounts** — list with accordion drill-down to invoices, edit side panel with alias management.

Supplier rows show: outstanding (black), overdue (red), credit (green).
- **Pay button** → payment side panel with receipt attachment thumbnails, auto-allocate, supplier credit info
- **Statement link** → opens in new tab (per-supplier, date range, running balance, receipt details on credits)
- **Invoice rows** → clickable → invoice preview panel (image, details, payment history)
- **Payment allocation sub-rows** → receipt links clickable → receipt preview panel
- **Remove** button on allocations → deletes allocation, recalcs invoice status
- **Apply Credit** button → allocates excess payment to oldest unpaid invoices

---

## Screen 11: Statement of Account (Built 2026-03-31)

Per-supplier page with date range picker.
- Opening/closing balance, running balance
- Debit entries: invoices (Purchase — vendor name)
- Credit entries: payments with receipt details (Payment — receipt number/merchant)
- Summary cards: Opening Balance, Total Debit, Total Credit, Closing Balance

---

## Screen 12: Employees/People Page (Built 2026-04-01)

Combined admins + employees on one page (separate "Admins" nav item removed).
- Firm filter at top
- **Admins section** — table with name, email, status, created date. Edit panel + activate/deactivate.
- **Employees section** — table with name, phone, email, firm, claims count, status. Edit panel + activate/deactivate.
- Add Admin modal (name, email, phone, password, firm)
- Add Employee modal (name, phone, email, firm)

---

## Screen 13: Clients Page (Built 2026-04-01)

Firm list table with employees count, claims this month, status.
- **Edit side panel** on each client row: firm name, registration number, contact email, phone, plan (free/paid)
- Client detail page (`/accountant/clients/[firmId]`) also has Edit button

---

## Screen 14: Categories Page (Updated 2026-04-01)

Default + Custom category sections (when firm selected).
- **Inline edit** (pencil icon) for both default and custom categories: name + tax code
- **Delete** (trash icon) for custom categories with confirmation
- Enable/Disable toggle for all categories
- Add Custom Category button (only when firm selected)

---

## Dashboard (Updated 2026-04-01)

3×2 stat card grid:
- Claims This Month | Pending Review (Claims)
- Receipts This Month | Unallocated Receipts
- Invoices This Month | Pending Review (Invoices)

Needs Attention: 3 tabs (Claims, Receipts, Invoices) with count badges.
- Row click → preview panel with full edit mode
- Claims: approve/reject actions
- Invoices: mark as reviewed
- Receipts: unlinked receipts needing payment attachment

---

## Submit Modals (Built 2026-04-01)

All three portals can manually submit documents via dashboard:

**Admin/Accountant Claims:** "Submit New" button → modal with Type (claim/receipt), Date, Merchant, Amount, Category, Receipt Number, Description, File upload. Accountant includes Firm selector.

**Admin/Accountant Invoices:** "Submit New Invoice" button → modal with Vendor, Invoice #, Issue Date, Due Date, Amount, Category, Payment Terms, File upload. Auto supplier matching. Accountant includes Firm selector.

**Employee Claims:** "Submit New Claim" button → modal with file upload (bug fixed: field name corrected).