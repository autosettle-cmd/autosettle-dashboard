# Auto-Suggestion & Matching Flow

Core system that powers intelligent matching across the platform. Three domains: **Supplier Matching** (OCR → supplier), **GL Auto-Suggest** (supplier/history → GL accounts), and **Bank Recon Auto-Match** (bank transactions → invoices/claims).

---

## 1. Supplier Matching (OCR Upload)

When a document is uploaded (WhatsApp, dashboard, batch), the system matches the vendor name to existing suppliers.

### Resolution Order
```
1. SupplierAlias table — exact match on normalized vendor name
   |-- is_confirmed = true  → status "confirmed"
   |-- is_confirmed = false → status "auto_matched"
2. No alias found → create new Supplier + unconfirmed alias → status "unmatched"
```

### Alias Learning
- When accountant/admin manually confirms a supplier, the vendor name is saved as a confirmed `SupplierAlias`
- Future uploads with the same vendor name auto-match instantly (confirmed)
- Aliases are normalized: `toLowerCase().trim()`
- Scoped per firm via supplier's `firm_id`

### Key Files
| File | Role |
|------|------|
| `app/api/invoices/route.ts` | Supplier matching on invoice creation (lines 232-253) |
| `lib/supplier-resolver.ts` | `resolveSupplier()` — alias lookup + new supplier creation |
| `lib/whatsapp/invoices.ts` | Supplier matching for WhatsApp uploads |
| `app/api/suppliers/alias/route.ts` | Manual alias confirmation endpoint |

---

## 2. GL Auto-Suggest (Invoice Preview)

When the accountant opens an invoice preview, GL accounts are auto-filled from multiple sources.

### Expense GL (Debit) — Resolution Order
```
1. invoice.gl_account_id          → previously saved on this invoice
2. supplier.default_gl_account_id → learned from past approvals
3. alias supplier GL              → via /api/suppliers/by-alias lookup
4. category → GL mapping          → from CategoryFirmOverride table
5. empty                          → accountant must select manually
```

### Contra GL (Credit) — Resolution Order
```
1. invoice.contra_gl_account_id            → previously saved
2. supplier.default_contra_gl_account_id   → learned from past approvals
3. alias supplier contra GL                → via /api/suppliers/by-alias
4. Fuzzy name match:
   - Strip vendor name to significant words (exclude sdn/bhd/plt)
   - Match against Liability GL account names
   - Substring match first, then 2+ word overlap
5. Firm default Trade Payables GL          → from accounting-settings
```

### GL Learning (on Approval)
- **Expense GL:** saved to supplier's `default_gl_account_id` if not already set (single-GL invoices only)
- **Contra GL:** **always** saved to supplier's `default_contra_gl_account_id` — accountant's explicit choice overwrites
- Both saved inside the approval transaction (no orphaned state)
- Next invoice from same supplier auto-fills both

### Claim GL Suggestion
Uses history-based matching (different from invoice GL):
```
1. Description token match (phone numbers) + merchant → past approved claims
2. Merchant-only match → past approved claims
3. Category GL override → CategoryFirmOverride table
4. empty → accountant must select
```

### Key Files
| File | Role |
|------|------|
| `components/pages/InvoicesPageContent.tsx` | GL auto-suggest useEffect on preview open |
| `app/api/suppliers/by-alias/route.ts` | Alias lookup for GL auto-fill |
| `app/api/gl-accounts/suggest/route.ts` | Claim GL suggestion (history-based) |
| `app/api/invoices/batch/route.ts` | GL learning on approval (transactional) |

---

## 3. Bank Recon Auto-Match

Matches bank transactions to approved invoices, sales invoices, and employee claims. Runs on statement upload or manual "RE-MATCH" button.

### Matching Passes (Decreasing Confidence)

| Pass | Strategy | Condition | Confidence |
|------|----------|-----------|------------|
| 1 | Invoice number in bank description + exact amount | Always | Highest |
| 2 | Exact amount + date within +/-3 days | Only if 1 candidate | High |
| 3 | Supplier/buyer name in description + exact amount | Only if 1 candidate | Medium |
| 4 | Exact amount only | Only if 1 unique candidate across all types | Lowest |

### Match Sources
- **Outgoing (debit):** supplier invoices (approved, unpaid/partial) + employee claims (reviewed, unpaid)
- **Incoming (credit):** sales invoices (approved, unpaid/partial)

### Name Matching Logic
Extracts words (3+ chars) from supplier name, aliases, vendor_name_raw. Checks if any word appears in the bank transaction description.

### Status Flow
```
Upload/RE-MATCH runs auto-match
    |
    v
Matched transactions → recon_status = "matched" (Suggested badge)
    |
    v
Table shows: "Review" button (gold) + "Unmatch" (red)
No "Confirm" in table — forces preview review first
    |
    v
Accountant clicks "Review" → Preview modal opens
    - Shows matched entity, JV preview, match pass info
    - Confirm button has red tooltip: "Auto-suggested match"
    |
    v
Accountant clicks "Confirm" → JV confirmation modal
    - Shows DR/CR lines with correct amounts
    - Partial match warning if matched < bank amount
    |
    v
Confirmed → recon_status = "manually_matched"
    - JV created (DR Trade Payables / CR Bank for outgoing)
    - Invoice amount_paid updated
    - Preview stays open with updated status (user navigates to next manually)
```

### Post-Action Navigation
- **Match modal**: After match/voucher/receipt creation → advances to next unmatched transaction. Closes if none remain.
- **Preview modal**: After confirm → stays on same transaction, refreshes data to show updated status. User presses Next (arrow key or button) when ready.

### Partial Match Handling
- One bank transaction can match multiple invoices (multi-invoice allocation)
- Each match creates a `BankTransactionInvoice` record with allocation amount
- Status shows "Partial" (amber badge) when total matched < bank transaction amount
- JV amounts use matched item amounts, not bank transaction amount

### Match Modal Auto Pre-Selection
When the match modal opens, a client-side 4-pass engine runs against outstanding items to pre-select the best match. Mirrors the upload-time auto-match logic but operates on the UI list.

| Pass | Strategy | Pre-selects if |
|------|----------|---------------|
| 1 | Reference number in bank description (normalized: `I000036` = `I-000036`) | Any match found (multiple OK). Amber warning if amount differs. |
| 2 | Exact amount + date within ±3 days | Only 1 candidate |
| 3 | Supplier/employee/merchant name in description + exact amount | Only 1 candidate |
| 4 | Exact amount only | Only 1 candidate across all types |

Applies to both invoices and claims. Auto-expands the supplier/employee group and switches to the correct tab.

### Multi-Invoice Selection (Match Modal)
- Invoices grouped by supplier — collapsible `btn-thick-white` keycap cards
- Supplier header: select-all checkbox + ACCOUNT badge + supplier name + total + chevron
- Individual invoices: `ds-table-checkbox` (green LED glow) + reference + remaining amount
- Claims grouped by employee — same collapsible keycap pattern
- JV confirmation shows one line per selected item

### Table Footer
Two summary rows in `<tfoot>`:
- **Total** row — all transactions, grey background (`var(--surface-low)`)
- **Matched** row — suggested + confirmed only, Steel Blue background (`var(--primary)`) with white text. Shows reconciled debit/credit at a glance.

### Key Files
| File | Role |
|------|------|
| `lib/bank-reconciliation.ts` | `autoMatchTransactions()` — 4-pass matching engine |
| `app/api/bank-reconciliation/rematch/route.ts` | RE-MATCH endpoint |
| `app/api/bank-reconciliation/match-item/route.ts` | Manual match + JV creation (supports incremental allocation) |
| `app/api/bank-reconciliation/confirm/route.ts` | Batch confirm suggested matches |
| `components/bank-recon/BankReconMatchModal.tsx` | Match modal with multi-select + JV confirmation |
| `components/bank-recon/BankReconPreviewModal.tsx` | Transaction preview with JV preview + confirm/unmatch |
| `components/pages/BankReconDetailContent.tsx` | Statement detail page with transaction table |

---

## 4. Auto-Suggest Visual Indicators

### OCR Auto-Fill (Batch Upload)
- Fields filled by OCR get `auto-suggested` CSS class — soft amber border + glow
- Empty fields stay default grey — signals "you need to fill this"
- On focus, amber glow reverts to standard blue focus ring

### Bank Recon Suggested Match
- "Suggested" amber badge in status column
- "Matched To" column shows matched entity name
- "Review" button (dark gold keycap) replaces "Confirm" in table
- Red tooltip on preview modal's Confirm button: "Auto-suggested match — review before confirming"
- No batch "Confirm All" — forces individual review

### Invoice GL Auto-Fill
- GL dropdowns pre-filled from supplier defaults / alias lookup / category mapping
- Accountant sees the pre-filled value and can change before approval
- Approval confirmation modal shows JV preview with actual GL account names

---

## 4. Bank Statement Parsing

### Parse Pipeline
```
PDF uploaded → pdf-parse extracts text → detect bank (regex)
    |
    v
Try regex parser first (free, instant)
    → Maybank: DD/MM + description + amount± + balance
    → OCBC: description + DD MMM YYYY + amounts
    |-- Success + transactions found → use regex result
    |-- No regex parser or 0 transactions → fallback to Gemini
    |
    v
Gemini fallback (gemini-1.5-flash)
    → Sends full text + bank-specific prompt
    → Returns structured JSON transactions
    |
    v
Balance verification → verifyBankStatement()
    |-- Mismatch? Auto-retry with alternate parser (regex↔Gemini)
    |-- Compare diffs, pick the better result
    |
    v
Post-dedup balance check
    |-- If dedup removed transactions AND broke balance → flag DEDUP_BALANCE_MISMATCH
    |
    v
Store verification_issues on BankStatement record
```

### Supported Banks
| Bank | Parser | Notes |
|------|--------|-------|
| Maybank | Regex (primary) + Gemini (fallback/retry) | Continuation lines joined with ` \| ` |
| OCBC | Regex (primary) + Gemini (fallback/retry) | Cheque number extraction, columns concatenated |
| CIMB, Public Bank, AmBank, RHB, Hong Leong | Gemini only | Detected but no dedicated regex |

### Date Parsing
All regex parsers use `Date.UTC()` to avoid timezone shifts. Without UTC, `new Date(2025, 11, 1)` creates Dec 1 at midnight local time (UTC+8), which becomes Nov 30 in UTC — causing incorrect dedup matches against previous month's statements.

### Transaction Dedup (`lib/bank-dedup.ts`)
Prevents duplicate transactions across overlapping statements:
1. Find existing statements with overlapping date range (same firm + account)
2. For each new transaction, find candidates: same date + same amount (±0.01)
3. **Tier 1 match**: exact normalized description or first 15 chars identical → skip (duplicate)
4. **Tier 2**: multiple description matches → pick first as duplicate
5. **Tier 3**: single amount+date candidate, description differs → still marked duplicate
6. New unique transactions inserted; duplicates skipped
7. **Post-dedup balance check**: if removed transactions cause a balance mismatch, stores `DEDUP_BALANCE_MISMATCH` error on the statement

### Upload-Time Verification (`lib/bank-statement-verify.ts`)
Pure function that runs after parsing. Results stored as `verification_issues` JSON on the BankStatement record.

| Check | Severity | Description |
|-------|----------|-------------|
| `MISSING_OPENING_BALANCE` | error | Opening balance not extracted |
| `MISSING_CLOSING_BALANCE` | error | Closing balance not extracted |
| `BALANCE_MISMATCH` | error | Opening − Debit + Credit ≠ Closing (tolerance 0.01) |
| `RUNNING_BALANCE_BREAK` | warning | Transaction running balance doesn't chain (skips null balances) |
| `DUPLICATE_TRANSACTION` | warning | Same date + amount + description within the statement |
| `ZERO_AMOUNT` | warning | Transaction has no debit or credit |
| `DATE_ORDER` | warning | Transaction date before previous transaction |
| `HEADER_DEBIT_MISMATCH` | warning | PDF header total debit ≠ sum of transaction debits |
| `HEADER_CREDIT_MISMATCH` | warning | PDF header total credit ≠ sum of transaction credits |
| `DEDUP_BALANCE_MISMATCH` | error | Dedup removed transactions causing balance mismatch (added post-dedup) |

### Balance Mismatch UI Flow
```
Detail page detects mismatch (useMemo on opening/closing/totals)
    |
    v
Has mismatch AND no override?
    → Red banner above table with balance details
    → All Match/Review/Unmatch buttons disabled (table + preview modal)
    → Two actions:
        1. Delete statement — remove and re-upload
        2. "Override & Proceed" → POST /api/bank-reconciliation/statements/[id]/override
            → Sets balance_override=true, records user + timestamp
            → Banner turns amber (informational), buttons re-enabled
```

### Key Files
| File | Role |
|------|------|
| `lib/bank-pdf-parser.ts` | PDF extraction, bank detection, regex parsers, Gemini call, auto-retry |
| `lib/bank-statement-verify.ts` | `verifyBankStatement()` — 7 verification checks |
| `lib/bank-dedup.ts` | `deduplicateTransactions()` — overlap detection + fuzzy dedup |
| `app/api/bank-reconciliation/statements/[id]/override/route.ts` | Balance override endpoint |

---

## 5. Duplicate Detection (Claims & Invoices)

### Claim Dedup (`lib/claim-dedup.ts`)
Runs on claim creation via `checkClaimDuplicate()`:

| Claim Type | Strategy | Fields Checked |
|-----------|----------|----------------|
| `mileage` | Composite key | firm_id + employee_id + claim_date + from_location + to_location + distance_km |
| `claim` / `receipt` | Receipt # first, then composite | 1. receipt_number (firm-wide) → 2. firm_id + employee_id + claim_date + merchant + amount + type |

### Invoice Dedup
Checked on upload in `app/api/invoices/route.ts`:
1. **File hash**: exact binary match via `file_hash` field → "Duplicate file: already uploaded"
2. **Invoice number**: same firm + supplier + invoice_number → "Duplicate: invoice # already exists"
3. **Composite key**: same firm + vendor_name + issue_date + total_amount → "Possible duplicate"

### When Dedup Runs
- Claims: on creation (WhatsApp + dashboard + batch)
- Invoices: on upload, before OCR processing
- Bank statements: on save, after parsing (file_hash on statement, fuzzy on transactions)

---

## Design Principles

1. **Suggest, don't decide** — auto-fill values but always let the accountant review and override
2. **Learn from corrections** — every manual selection improves future suggestions (supplier GL, aliases)
3. **Forced review for JV** — no JV creation without accountant seeing the DR/CR preview first
4. **Transparent confidence** — show match pass info ("Pass 3: name+amount") so accountant knows why it matched
5. **Partial is visible** — never hide the fact that a match is partial; amber badge + remaining amount shown
6. **Transaction safety** — all JV-creating operations wrapped in `$transaction` to prevent orphaned state
