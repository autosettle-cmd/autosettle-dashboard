import { AccountType, NormalBalance } from "../generated/prisma";

export type CoAEntry = {
  code: string;
  name: string;
  type: AccountType;
  balance: NormalBalance;
  parentCode: string | null;
};

// DS PLUS SDN BHD — SQL Accounting Chart of Accounts (from GL Account.fr3.pdf)
// 96 accounts exactly matching the PDF, no synthetic group headers
export const SQL_ACCOUNTING_COA: CoAEntry[] = [
  // ─── NON-CURRENT ASSETS (FA) ─────────────────────────────────────────────
  { code: "200-200", name: "OFFICE EQUIPMENT",                      type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "200-205", name: "ACCUM DEPRN. - OFFICE EQUIPMENT",       type: AccountType.Asset,     balance: NormalBalance.Credit, parentCode: null },
  { code: "200-300", name: "FURNITURE & FITTINGS",                   type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "200-305", name: "ACCUM. DEPRN. - FURNITURE & FITTINGS",  type: AccountType.Asset,     balance: NormalBalance.Credit, parentCode: null },
  { code: "200-400", name: "RENOVATION",                             type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "200-405", name: "ACCUM DEPRN. - RENOVATION",             type: AccountType.Asset,     balance: NormalBalance.Credit, parentCode: null },
  { code: "200-500", name: "SOFTWARE",                               type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "200-505", name: "ACCUM DEPRN. - SOFTWARE",               type: AccountType.Asset,     balance: NormalBalance.Credit, parentCode: null },
  // ─── OTHER ASSETS (OA) ───────────────────────────────────────────────────
  { code: "210-000", name: "GOODWILL",                               type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  // ─── CURRENT ASSETS (CA) ─────────────────────────────────────────────────
  { code: "300-000", name: "TRADE DEBTORS",                          type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "305-000", name: "OTHER DEBTORS",                          type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "310-000", name: "CASH AT BANK",                           type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "310-001", name: "MAYBANK - 562526546065",                 type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: "310-000" },
  { code: "310-002", name: "OCBC - 7101354433",                     type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: "310-000" },
  { code: "320-000", name: "CASH IN HAND",                           type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "325-000", name: "PETTY CASH",                             type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "330-000", name: "STOCK",                                  type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "340-000", name: "DEPOSIT & PREPAYMENT",                   type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "350-000", name: "DIRECTOR'S ACCOUNT",                     type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  { code: "PREPAYSUPP", name: "PREPAYMENT TO SUPPLIER",              type: AccountType.Asset,     balance: NormalBalance.Debit,  parentCode: null },
  // ─── CURRENT LIABILITIES (CL) ────────────────────────────────────────────
  { code: "400-000", name: "TRADE CREDITORS",                        type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "405-000", name: "OTHER CREDITORS",                        type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "410-000", name: "ACCRUALS",                               type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "410-010", name: "WAGES & SALARIES ACCRUED",               type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-020", name: "ACCRUED EXPENSES",                       type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-030", name: "COMMISSION ACCRUED",                     type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-040", name: "O.T. ACCRUED",                           type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-050", name: "OFFICE & WAREHOUSE ACCRUED",             type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-060", name: "TELEPHONE & FAX CHARGES ACCRUED",        type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-070", name: "ELECTRICITY ACCRUED",                    type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "410-080", name: "WATER ACCRUED",                          type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: "410-000" },
  { code: "420-000", name: "EPF",                                    type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "430-000", name: "SOCSO",                                  type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "440-000", name: "EIS",                                    type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "450-000", name: "CONTRA ACCOUNT",                         type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "460-000", name: "PCB",                                    type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  { code: "PREPAYCUST", name: "PREPAYMENT FROM CUSTOMER",            type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
  // ─── EQUITY ──────────────────────────────────────────────────────────────
  { code: "100-000", name: "EQUITY",                                 type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: null },
  { code: "150-000", name: "RETAINED EARNING",                       type: AccountType.Equity,    balance: NormalBalance.Credit, parentCode: null },
  // ─── REVENUE (SL) ────────────────────────────────────────────────────────
  { code: "500-000", name: "DOMESTIC SALES",                         type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "500-100", name: "SALES - COD",                            type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "500-200", name: "SALES - FB",                             type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "500-400", name: "SALES - SHOPEE",                         type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "501-000", name: "FOREIGN SALES",                          type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "500-300", name: "SALES - COD (SGD)",                      type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: "501-000" },
  // ─── REVENUE ADJUSTMENT (SA) ─────────────────────────────────────────────
  { code: "510-000", name: "RETURN INWARDS",                         type: AccountType.Revenue,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "520-000", name: "DISCOUNT ALLOWED",                       type: AccountType.Revenue,   balance: NormalBalance.Debit,  parentCode: null },
  // ─── COST OF GOODS SOLD (CO) ─────────────────────────────────────────────
  { code: "600-000", name: "STOCKS AT THE BEGINNING OF YEAR",        type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "610-000", name: "PURCHASE",                                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "612-000", name: "PURCHASE RETURNED",                      type: AccountType.Expense,   balance: NormalBalance.Credit, parentCode: null },
  { code: "613-000", name: "PACKAGING MATERIAL",                     type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "615-000", name: "CARRIAGE INWARDS",                       type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "620-000", name: "STOCKS AT THE END OF THE YEAR",          type: AccountType.Expense,   balance: NormalBalance.Credit, parentCode: null },
  { code: "630-000", name: "TRANSPORTATION CHARGES",                 type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  // ─── OTHER INCOME (OI) ───────────────────────────────────────────────────
  { code: "530-000", name: "GAIN ON FOREIGN EXCHANGE",               type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  { code: "530-100", name: "HANDLING CHARGES",                       type: AccountType.Revenue,   balance: NormalBalance.Credit, parentCode: null },
  // ─── EXPENSES (EP) ───────────────────────────────────────────────────────
  { code: "901-001", name: "ADVERTISEMENT",                          type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "901-002", name: "ACCOUNTING FEE",                         type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "901-003", name: "AUDIT FEE",                              type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "902-000", name: "BANK CHARGES",                           type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "903-000", name: "CONSUMABLE",                             type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "904-001", name: "DESIGN FEE",                             type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "904-002", name: "DIRECTOR FEE",                           type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "904-003", name: "DEPRECIATION",                           type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "905-001", name: "ENTERTAINMENT",                          type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "905-002", name: "EPF",                                    type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "905-003", name: "EIS",                                    type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "905-004", name: "EVENT & EXHIBITION EXPENSES",            type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "906-000", name: "UPKEEP OF MOTOR VEHICLE",                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "907-000", name: "WATER & ELECTRICITY",                    type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "908-000", name: "H",                                      type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "909-000", name: "I",                                      type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "910-000", name: "TELEPHONE & FAX CHARGES",                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "911-000", name: "HIRE PURCHASE INTEREST",                 type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "912-000", name: "CLERICAL CHARGES",                       type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "913-000", name: "MEDICAL EXPENSES",                       type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "914-000", name: "OVER TIME",                              type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "915-000", name: "OFFICE & WAREHOUSE RENTAL",              type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "916-001", name: "PETROL",                                 type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "916-002", name: "PARTIMER",                               type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "917-000", name: "TRAVEL & ACCOMMODATION",                 type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "918-000", name: "DIRECTOR'S REMUNERATION",                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "919-001", name: "SECRETARIAL EXPENSES",                   type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "919-002", name: "STATIONERIES",                           type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "919-003", name: "SUBSCRIPTION FEE",                       type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "919-004", name: "SUNDRY EXPENSES",                        type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "919-005", name: "SOCSO",                                  type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "920-000", name: "PRINTING",                               type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "920-001", name: "TOLL & PARKING",                         type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "920-002", name: "TELEPHONE",                              type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "920-003", name: "TAX FEE",                                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "921-001", name: "UPKEEP OF OFFICE",                       type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "922-000", name: "OFFICE REFRESHMENT",                     type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "923-001", name: "WITHHOLDING TAX",                        type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  { code: "980-000", name: "LOSS ON FOREIGN EXCHANGE",               type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
  // ─── TAXATION (TX) ───────────────────────────────────────────────────────
  { code: "950-000", name: "TAXATION",                                type: AccountType.Expense,   balance: NormalBalance.Debit,  parentCode: null },
];

// System account not in SQL Accounting but needed by our system
export const SYSTEM_ACCOUNTS: CoAEntry[] = [
  { code: "405-001", name: "STAFF CLAIMS PAYABLE",                   type: AccountType.Liability, balance: NormalBalance.Credit, parentCode: null },
];
