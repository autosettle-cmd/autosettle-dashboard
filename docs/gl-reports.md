# GL Reports

Four financial reports built on posted journal entries. All use the same core API (`/api/general-ledger`) with client-side aggregation.

---

## Common Features

- **Period selector**: dropdown of fiscal periods
- **Date range**: all time / this month / last month / custom
- **Hierarchical display**: parent/child GL accounts, collapsible
- **Only posted JVs**: reversed entries stay in data (both posted), toggle to hide
- **Firm-scoped**: all queries filtered by selected firm

## API

### GET `/api/general-ledger`
Returns all GL accounts for a firm with aggregated debit/credit/balance from posted journal lines.

**Params:** firmId (required), periodId OR dateFrom/dateTo

### GET `/api/general-ledger/[accountId]`
Drill-down: line-item detail for a single GL account. Returns opening balance (Balance B/F) + individual journal lines with running balance.

---

## Reports

### General Ledger
**Purpose:** Full account-by-account view of all posted transactions.

| Column | Content |
|--------|---------|
| Account | Code + name (hierarchical) |
| Debit | Sum of debit amounts |
| Credit | Sum of credit amounts |
| Balance | Debit - Credit (or Credit - Debit for credit-normal) |

- Click any account → drill-down modal with line items
- Toggle to hide zero-balance accounts
- Toggle to hide/show reversal entries (recalculates running balance)
- Shows balanced indicator (total DR = total CR)

### Trial Balance
**Purpose:** Verify all accounts balance (total debits = total credits).

| Column | Content |
|--------|---------|
| Account | Code + name, grouped by type (Asset, Liability, Equity, Revenue, Expense) |
| Debit | Debit-normal accounts with positive balance |
| Credit | Credit-normal accounts with positive balance |

- Contra balances flip to opposite column (e.g., negative debit-normal → Credit column)
- Grand total row: green if balanced, red if out of balance
- Section subtotals per account type

### Profit & Loss
**Purpose:** Revenue minus Expenses = Net Profit/Loss.

| Section | Content |
|---------|---------|
| Revenue | All Revenue accounts with balances |
| Expenses | All Expense accounts with balances |
| **Net** | Revenue - Expenses (green if profit, red if loss) |

### Balance Sheet
**Purpose:** Assets = Liabilities + Equity at a point in time.

| Section | Content |
|---------|---------|
| Assets | All Asset accounts |
| Liabilities | All Liability accounts |
| Equity | Equity accounts + retained earnings + current period earnings |

**Special logic:** When a period is selected, makes two API calls:
1. Cumulative fetch (dateTo = period end) for balance sheet accounts
2. Period-only fetch for current period Revenue/Expense (to calculate current period earnings)

Balance verification: Assets = Liabilities + Equity (green/red indicator).

---

## Key Files

| File | Role |
|------|------|
| `app/api/general-ledger/route.ts` | Aggregate posted JVs by GL account |
| `app/api/general-ledger/[accountId]/route.ts` | Line-item drill-down with opening balance |
| `app/accountant/general-ledger/page.tsx` | GL report page |
| `app/accountant/trial-balance/page.tsx` | Trial Balance page |
| `app/accountant/profit-loss/page.tsx` | P&L page |
| `app/accountant/balance-sheet/page.tsx` | Balance Sheet page |
