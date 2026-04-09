# Autosettle System Outline

## 1. Login / Signup
- Login page
- Signup page
- Role-based redirect → Admin / Accountant / Employee dashboard

---

## 2. Admin Portal
### 2.1 Dashboard
- Summary stats (pending claims, invoices, receipts)
- Quick action cards

### 2.2 Claims
- Employee expense claims list
- Filter by status (pending_review → pending_approval → approved → rejected)
- Claim detail modal with receipt thumbnails
- Approve/reject actions → creates JV on approval

### 2.3 Invoices
- Supplier purchase invoices list
- Filter by status, supplier, date range
- Invoice preview modal
- Approve/reject → creates JV on approval

### 2.4 Invoices — Aging
- Aging report (current, 30, 60, 90, 120+ days)

### 2.5 Suppliers
- Supplier list with aliases
- Supplier detail → Statement of Account (SOA)

### 2.6 Supplier Statement (SOA)
- Debit/credit ledger per supplier
- Running balance

### 2.7 Employees
- Employee list management

### 2.8 Categories
- Expense category management

### 2.9 Bank Reconciliation
- Upload bank statement PDF (Maybank)
- Statement list with progress bars (matched/unmatched/excluded)
- GL account mapping per bank account

### 2.10 Bank Reconciliation — Detail
- Transaction list with match status tabs
- Auto-match suggestions (3-pass algorithm)
- Manual match to payments
- Create payment voucher / official receipt from unmatched
- Confirm all / re-match actions
- Exclude with notes

### 2.11 Chart of Accounts
- COA tree with drag-drop reordering
- Account types (Asset, Liability, Equity, Revenue, Expense)

### 2.12 Fiscal Periods
- Fiscal year / period management
- Open/close periods

### 2.13 Tax Codes
- SST / tax code management

### 2.14 Audit Log
- System activity log

---

## 3. Accountant Portal
### 3.1 Dashboard
- Multi-firm overview stats
- Confidence sort for review priority

### 3.2 Clients
- Firm list (accountant manages multiple firms)
- Client detail page per firm

### 3.3 Admins
- Admin users management per firm

### 3.4 Claims
- Cross-firm claims review
- Approve/reject → creates JV

### 3.5 Invoices
- Cross-firm invoice review
- Approve/reject → creates JV

### 3.6 Invoices — Aging
- Cross-firm aging report

### 3.7 Suppliers
- Cross-firm supplier management
- Supplier SOA

### 3.8 Employees
- Cross-firm employee list

### 3.9 Categories
- Cross-firm category management

### 3.10 Bank Reconciliation
- Same as admin but across firms
- Upload with firm selector

### 3.11 Bank Reconciliation — Detail
- Same as admin detail view

### 3.12 Chart of Accounts
- Cross-firm COA management

### 3.13 Journal Entries
- Journal entry list
- Filter by type, period, firm
- JV detail with debit/credit lines

### 3.14 General Ledger
- GL report by account
- Filter by period, account, firm
- Running balance per account

### 3.15 Fiscal Periods
- Cross-firm period management

### 3.16 Audit Log
- Cross-firm activity log

---

## 4. Employee Portal
### 4.1 Dashboard
- Personal claims summary

### 4.2 Claims
- Submit expense claims
- View own claim status

---

## 5. WhatsApp Bot
### 5.1 Receipt Upload
- Photo/PDF → OCR via Gemini → auto-create receipt
- Multi-receipt sessions

### 5.2 Invoice Upload
- Photo/PDF → OCR → auto-create supplier invoice

### 5.3 Mileage Claims
- Step-by-step flow (from → to → distance → amount)
- Firm rate setting

### 5.4 Admin Role Detection
- Auto-detect admin vs employee from phone number

---

## 6. Core Flows
### 6.1 Document → Approval → JV
- Receipt/Invoice/Claim submitted
- Admin reviews (pending_review → pending_approval)
- Accountant approves → Journal Voucher auto-created
- GL account selected on approval

### 6.2 Bank Recon Flow
- Upload PDF → parse transactions
- Dedup against existing (overlapping statements)
- Auto-match (reference → amount+date → supplier name)
- Manual match / create voucher or receipt
- Confirm → JV created

### 6.3 Payment Flow
- Payment voucher (from bank recon or manual)
- Official receipt (from bank recon credits)
- Receipt-invoice set-off with allocation

### 6.4 Sales Invoice Flow
- Supplier sales invoices
- Linked to bank recon credits

---

## 7. Key Integrations
- Google Drive — file storage (receipts, invoices, bank statements)
- Gemini AI — OCR extraction for receipts/invoices
- WhatsApp Business API — bot for document submission
- ngrok — webhook tunnel for local WhatsApp testing
