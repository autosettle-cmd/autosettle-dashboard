import type { ParseResult } from './bank-pdf-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerificationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  transactionIndex?: number;
}

export interface VerificationResult {
  passed: boolean;    // true if zero errors (warnings OK)
  issues: VerificationIssue[];
}

// ─── Verification ────────────────────────────────────────────────────────────

export function verifyBankStatement(result: ParseResult): VerificationResult {
  const issues: VerificationIssue[] = [];

  const { transactions, openingBalance, closingBalance, totalDebit: headerDebit, totalCredit: headerCredit } = result;

  // 1. Missing opening/closing balance
  if (openingBalance === null || openingBalance === undefined) {
    issues.push({ severity: 'error', code: 'MISSING_OPENING_BALANCE', message: 'Opening balance could not be extracted from the statement.' });
  }
  if (closingBalance === null || closingBalance === undefined) {
    issues.push({ severity: 'error', code: 'MISSING_CLOSING_BALANCE', message: 'Closing balance could not be extracted from the statement.' });
  }

  // 2. Opening/closing balance mismatch
  if (openingBalance !== null && closingBalance !== null) {
    const totalDr = transactions.reduce((s, t) => s + (t.debit ?? 0), 0);
    const totalCr = transactions.reduce((s, t) => s + (t.credit ?? 0), 0);
    const expected = openingBalance - totalDr + totalCr;
    const diff = Math.abs(expected - closingBalance);
    if (diff > 0.01) {
      issues.push({
        severity: 'error',
        code: 'BALANCE_MISMATCH',
        message: `Balance mismatch: Opening (${fmt(openingBalance)}) − Debit (${fmt(totalDr)}) + Credit (${fmt(totalCr)}) = ${fmt(expected)}, but closing balance is ${fmt(closingBalance)}. Difference: ${fmt(diff)}`,
      });
    }

    // 6. Statement header total cross-check
    if (headerDebit !== null && headerDebit !== undefined) {
      const headerDiff = Math.abs(headerDebit - totalDr);
      if (headerDiff > 0.01) {
        issues.push({
          severity: 'warning',
          code: 'HEADER_DEBIT_MISMATCH',
          message: `PDF header shows total debit ${fmt(headerDebit)} but sum of transactions is ${fmt(totalDr)}. Possible missed or extra transactions.`,
        });
      }
    }
    if (headerCredit !== null && headerCredit !== undefined) {
      const headerDiff = Math.abs(headerCredit - totalCr);
      if (headerDiff > 0.01) {
        issues.push({
          severity: 'warning',
          code: 'HEADER_CREDIT_MISMATCH',
          message: `PDF header shows total credit ${fmt(headerCredit)} but sum of transactions is ${fmt(totalCr)}. Possible missed or extra transactions.`,
        });
      }
    }
  }

  // 3. Running balance consistency
  if (openingBalance !== null) {
    let prevBalance = openingBalance;
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      if (t.balance !== null) {
        const expected = prevBalance - (t.debit ?? 0) + (t.credit ?? 0);
        const diff = Math.abs(expected - t.balance);
        if (diff > 0.01) {
          issues.push({
            severity: 'warning',
            code: 'RUNNING_BALANCE_BREAK',
            message: `Transaction #${i + 1} (${t.description.slice(0, 40)}): expected balance ${fmt(expected)} but got ${fmt(t.balance)}.`,
            transactionIndex: i,
          });
        }
        prevBalance = t.balance;
      } else {
        // No balance on this txn — update prevBalance with calculated value
        prevBalance = prevBalance - (t.debit ?? 0) + (t.credit ?? 0);
      }
    }
  }

  // 4. Duplicate transactions
  const seen = new Map<string, number>();
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    const key = `${t.transactionDate.toISOString().slice(0, 10)}|${t.debit ?? 0}|${t.credit ?? 0}|${t.description.trim().toLowerCase()}`;
    if (seen.has(key)) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_TRANSACTION',
        message: `Transaction #${i + 1} appears to be a duplicate of #${seen.get(key)! + 1} (same date, amount, description).`,
        transactionIndex: i,
      });
    } else {
      seen.set(key, i);
    }
  }

  // 5. Zero-amount transactions
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (!t.debit && !t.credit) {
      issues.push({
        severity: 'warning',
        code: 'ZERO_AMOUNT',
        message: `Transaction #${i + 1} (${t.description.slice(0, 40)}) has no debit or credit amount.`,
        transactionIndex: i,
      });
    }
  }

  // 6. Date ordering
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1].transactionDate;
    const curr = transactions[i].transactionDate;
    if (curr < prev) {
      issues.push({
        severity: 'warning',
        code: 'DATE_ORDER',
        message: `Transaction #${i + 1} date (${curr.toISOString().slice(0, 10)}) is before previous transaction (${prev.toISOString().slice(0, 10)}).`,
        transactionIndex: i,
      });
    }
  }

  return {
    passed: issues.every(i => i.severity !== 'error'),
    issues,
  };
}

function fmt(n: number): string {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
