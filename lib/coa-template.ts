import { AccountType, NormalBalance } from "../generated/prisma";

export type CoATemplateEntry = {
  code: string;
  name: string;
  type: AccountType;
  balance: NormalBalance;
  parentCode: string | null;
};

// Default Malaysian SME Chart of Accounts template
// Replace with SQL Accounting codes when available from accountant
export const MALAYSIAN_COA_TEMPLATE: CoATemplateEntry[] = [
  // ─── ASSETS (100-199) ─────────────────────────────────────────────────────
  { code: "100-000", name: "Assets",                        type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: null },
  { code: "110-000", name: "Current Assets",                type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "100-000" },
  { code: "111-000", name: "Cash & Bank",                   type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "110-000" },
  { code: "111-001", name: "Cash in Hand",                  type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "111-000" },
  { code: "111-002", name: "Bank - Current Account",        type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "111-000" },
  { code: "111-003", name: "Bank - Savings Account",        type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "111-000" },
  { code: "112-000", name: "Accounts Receivable",           type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "110-000" },
  { code: "112-001", name: "Trade Receivables",             type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "112-000" },
  { code: "113-000", name: "Prepayments & Deposits",        type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "110-000" },
  { code: "114-000", name: "Inventory",                     type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "110-000" },
  { code: "115-000", name: "SST Input Tax",                 type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "110-000" },
  { code: "120-000", name: "Non-Current Assets",            type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "100-000" },
  { code: "121-000", name: "Property, Plant & Equipment",   type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "120-000" },
  { code: "122-000", name: "Accumulated Depreciation",      type: AccountType.Asset,     balance: NormalBalance.Credit, parentCode: "120-000" },
  { code: "123-000", name: "Intangible Assets",             type: AccountType.Asset,     balance: NormalBalance.Debit, parentCode: "120-000" },

  // ─── LIABILITIES (200-299) ────────────────────────────────────────────────
  { code: "200-000", name: "Liabilities",                   type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "210-000", name: "Current Liabilities",           type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "200-000" },
  { code: "211-000", name: "Accounts Payable",              type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "210-000" },
  { code: "211-001", name: "Trade Payables",                type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "211-000" },
  { code: "212-000", name: "Accrued Expenses",              type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "210-000" },
  { code: "213-000", name: "SST Output Tax",                type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "210-000" },
  { code: "214-000", name: "Staff Claims Payable",          type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "210-000" },
  { code: "215-000", name: "Income Tax Payable",            type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "210-000" },
  { code: "220-000", name: "Non-Current Liabilities",       type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "200-000" },
  { code: "221-000", name: "Bank Loans",                    type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "220-000" },
  { code: "222-000", name: "Hire Purchase",                 type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "220-000" },

  // ─── EQUITY (300-399) ─────────────────────────────────────────────────────
  { code: "300-000", name: "Equity",                        type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: null },
  { code: "310-000", name: "Share Capital",                 type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: "300-000" },
  { code: "320-000", name: "Retained Earnings",             type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: "300-000" },
  { code: "330-000", name: "Director's Account",            type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: "300-000" },

  // ─── REVENUE (400-499) ────────────────────────────────────────────────────
  { code: "400-000", name: "Revenue",                       type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "410-000", name: "Sales Revenue",                 type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "400-000" },
  { code: "420-000", name: "Service Revenue",               type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "400-000" },
  { code: "430-000", name: "Other Income",                  type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "400-000" },
  { code: "431-000", name: "Interest Income",               type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "430-000" },
  { code: "432-000", name: "Foreign Exchange Gain",         type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "430-000" },

  // ─── COST OF SALES (500-599) ──────────────────────────────────────────────
  { code: "500-000", name: "Cost of Sales",                 type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: null },
  { code: "510-000", name: "Purchases",                     type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "500-000" },
  { code: "520-000", name: "Direct Labour",                 type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "500-000" },
  { code: "530-000", name: "Subcontractor Costs",           type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "500-000" },

  // ─── OPERATING EXPENSES (600-699) ─────────────────────────────────────────
  { code: "600-000", name: "Operating Expenses",            type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: null },
  { code: "601-000", name: "Salaries & Wages",              type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "602-000", name: "EPF Contribution",              type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "603-000", name: "SOCSO Contribution",            type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "604-000", name: "EIS Contribution",              type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "605-000", name: "Staff Welfare & Benefits",      type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "606-000", name: "Staff Training",                type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "610-000", name: "Rental",                        type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "611-000", name: "Utilities",                     type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "612-000", name: "Communication (Phone/Internet)",type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "613-000", name: "Office Supplies & Expenses",    type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "614-000", name: "Repairs & Maintenance",         type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "615-000", name: "Motor Vehicle Expenses",        type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "616-000", name: "Travel & Accommodation",        type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "617-000", name: "Entertainment",                 type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "618-000", name: "Advertising & Marketing",       type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "619-000", name: "Insurance",                     type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "620-000", name: "Professional Fees",             type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "621-000", name: "Bank Charges",                  type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "622-000", name: "Software & Subscriptions",      type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "623-000", name: "Depreciation",                  type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "624-000", name: "Taxes & Licenses",              type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "625-000", name: "Miscellaneous Expenses",        type: AccountType.Expense,   balance: NormalBalance.Debit, parentCode: "600-000" },
  { code: "626-000", name: "Merchandise & Inventory Expense", type: AccountType.Expense, balance: NormalBalance.Debit, parentCode: "600-000" },
];

// Default mapping: Category name → GL account code
// Used when seeding to auto-set CategoryFirmOverride.gl_account_id
export const CATEGORY_GL_DEFAULTS: Record<string, string> = {
  "Advertising & Marketing":    "618-000",
  "Automotive":                 "615-000",
  "Bank & Finance":             "621-000",
  "Communication":              "612-000",
  "Equipment & Hardware":       "613-000",
  "Insurance":                  "619-000",
  "Meals & Entertainment":      "617-000",
  "Merchandise & Inventory":    "626-000",
  "Office Expenses":            "613-000",
  "Professional Services":      "620-000",
  "Rent & Facilities":          "610-000",
  "Repairs & Maintenance":      "614-000",
  "Software & SaaS":            "622-000",
  "Staff Welfare":              "605-000",
  "Taxes & Licenses":           "624-000",
  "Training & Education":       "606-000",
  "Travel & Transport":         "616-000",
  "Utilities":                  "611-000",
  "Miscellaneous":              "625-000",
};
