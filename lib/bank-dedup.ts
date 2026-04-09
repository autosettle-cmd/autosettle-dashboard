import { prisma } from './prisma';
import { ParsedBankTransaction } from './bank-pdf-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverlappingStatement {
  id: string;
  file_name: string;
  period_start: Date | null;
  period_end: Date | null;
  statement_date: Date;
}

interface DedupResult {
  unique: ParsedBankTransaction[];
  duplicates: { transaction: ParsedBankTransaction; matchedExistingId: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize description for fuzzy comparison: lowercase, collapse whitespace, trim */
function normalizeDescription(desc: string): string {
  return desc.toLowerCase().replace(/\s+/g, ' ').replace(/[|]/g, ' ').trim();
}

/** Check if two descriptions are similar enough to be the same transaction */
function descriptionsMatch(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Compare first 15 characters (covers most bank ref prefixes)
  if (na.length >= 15 && nb.length >= 15 && na.substring(0, 15) === nb.substring(0, 15)) return true;
  return false;
}

// ─── Main Functions ──────────────────────────────────────────────────────────

/**
 * Find existing statements that overlap with the given period for the same bank account.
 */
export async function findOverlappingStatements(
  firmId: string,
  accountNumber: string | null,
  periodStart: Date,
  periodEnd: Date,
): Promise<OverlappingStatement[]> {
  if (!accountNumber) return [];

  return prisma.bankStatement.findMany({
    where: {
      firm_id: firmId,
      account_number: accountNumber,
      // Date ranges overlap: existing.start <= new.end AND existing.end >= new.start
      period_start: { lte: periodEnd },
      period_end: { gte: periodStart },
    },
    select: {
      id: true,
      file_name: true,
      period_start: true,
      period_end: true,
      statement_date: true,
    },
  });
}

/**
 * Compare new transactions against existing ones for the same bank account.
 * Returns unique (new) transactions and identified duplicates.
 */
export async function deduplicateTransactions(
  firmId: string,
  accountNumber: string | null,
  newTransactions: ParsedBankTransaction[],
): Promise<DedupResult> {
  if (!accountNumber || newTransactions.length === 0) {
    return { unique: newTransactions, duplicates: [] };
  }

  // Compute date range of new transactions
  const dates = newTransactions.map((t) => t.transactionDate.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  // Fetch existing transactions for the same account within overlapping date range
  const existingTxns = await prisma.bankTransaction.findMany({
    where: {
      bankStatement: {
        firm_id: firmId,
        account_number: accountNumber,
      },
      transaction_date: { gte: minDate, lte: maxDate },
    },
    select: {
      id: true,
      transaction_date: true,
      description: true,
      debit: true,
      credit: true,
    },
  });

  if (existingTxns.length === 0) {
    return { unique: newTransactions, duplicates: [] };
  }

  // Track which existing transactions have already been matched to avoid double-matching
  const usedExistingIds = new Set<string>();
  const unique: ParsedBankTransaction[] = [];
  const duplicates: DedupResult['duplicates'] = [];

  for (const newTxn of newTransactions) {
    const newDate = newTxn.transactionDate.toISOString().split('T')[0];

    // Find candidates: same date + same amount
    const candidates = existingTxns.filter((ex) => {
      if (usedExistingIds.has(ex.id)) return false;
      const exDate = new Date(ex.transaction_date).toISOString().split('T')[0];
      if (exDate !== newDate) return false;

      // Amount must match exactly (debit-to-debit or credit-to-credit)
      if (newTxn.debit != null && ex.debit != null) {
        return Math.abs(Number(ex.debit) - newTxn.debit) < 0.01;
      }
      if (newTxn.credit != null && ex.credit != null) {
        return Math.abs(Number(ex.credit) - newTxn.credit) < 0.01;
      }
      return false;
    });

    if (candidates.length === 0) {
      unique.push(newTxn);
      continue;
    }

    // Check description similarity among candidates
    const descMatches = candidates.filter((c) => descriptionsMatch(newTxn.description, c.description));

    if (descMatches.length === 1) {
      // Clear match — same date, same amount, similar description
      usedExistingIds.add(descMatches[0].id);
      duplicates.push({ transaction: newTxn, matchedExistingId: descMatches[0].id });
    } else if (descMatches.length > 1) {
      // Multiple description matches (rare: e.g. two identical ATM withdrawals)
      // Pick the first one — still a duplicate
      usedExistingIds.add(descMatches[0].id);
      duplicates.push({ transaction: newTxn, matchedExistingId: descMatches[0].id });
    } else if (candidates.length === 1) {
      // Only one amount+date match but description differs — still likely same transaction
      // (description formatting can vary between partial and full statements)
      usedExistingIds.add(candidates[0].id);
      duplicates.push({ transaction: newTxn, matchedExistingId: candidates[0].id });
    } else {
      // Multiple candidates, none match on description — ambiguous, keep as new to be safe
      unique.push(newTxn);
    }
  }

  return { unique, duplicates };
}

/**
 * Compute period start/end from a list of parsed transactions.
 */
export function computePeriodRange(transactions: ParsedBankTransaction[]): { periodStart: Date; periodEnd: Date } | null {
  if (transactions.length === 0) return null;
  const dates = transactions.map((t) => t.transactionDate.getTime());
  return {
    periodStart: new Date(Math.min(...dates)),
    periodEnd: new Date(Math.max(...dates)),
  };
}
