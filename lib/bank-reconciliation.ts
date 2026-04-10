import { prisma } from './prisma';

interface MatchResult {
  matched: number;
  unmatched: number;
}

/**
 * Auto-match bank transactions to existing Payment records.
 * Runs 3 passes with decreasing confidence:
 *   Pass 1: Reference match (exact ref + amount within ±0.01 + date within ±5 days)
 *   Pass 2: Amount + Date match (exact amount + date within ±3 days, only if 1 candidate)
 *   Pass 3: Supplier name match (description contains supplier name + amount match)
 */
export async function autoMatchTransactions(
  firmId: string,
  bankStatementId: string
): Promise<MatchResult> {
  // Load all unmatched bank transactions for this statement
  const bankTxns = await prisma.bankTransaction.findMany({
    where: { bank_statement_id: bankStatementId, recon_status: 'unmatched' },
  });

  if (bankTxns.length === 0) return { matched: 0, unmatched: 0 };

  // Load all unreconciled payments for this firm (not already linked to a bank transaction)
  const payments = await prisma.payment.findMany({
    where: {
      firm_id: firmId,
      bankTransactions: { none: {} },
    },
    include: {
      supplier: {
        select: { name: true, aliases: { select: { alias: true } } },
      },
    },
  });

  // Build lookup structures
  const paymentsByRef = new Map<string, typeof payments>();
  const paymentsByAmount = new Map<string, typeof payments>();

  for (const p of payments) {
    // By reference
    if (p.reference) {
      const ref = p.reference.toLowerCase().trim();
      const list = paymentsByRef.get(ref) ?? [];
      list.push(p);
      paymentsByRef.set(ref, list);
    }
    // By amount (key = amount string for exact match)
    const amtKey = Number(p.amount).toFixed(2);
    const list = paymentsByAmount.get(amtKey) ?? [];
    list.push(p);
    paymentsByAmount.set(amtKey, list);
  }

  const matched: { bankTxnId: string; paymentId: string }[] = [];
  const matchedPaymentIds = new Set<string>();
  const unmatchedBankTxnIds = new Set(bankTxns.map((t) => t.id));

  // ── Pass 1: Reference match ──
  for (const txn of bankTxns) {
    if (!unmatchedBankTxnIds.has(txn.id)) continue;

    const txnRef = (txn.reference ?? '').toLowerCase().trim();
    if (!txnRef) continue;

    const candidates = paymentsByRef.get(txnRef);
    if (!candidates) continue;

    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const txnDate = txn.transaction_date.getTime();

    for (const p of candidates) {
      if (matchedPaymentIds.has(p.id)) continue;

      const pAmount = Number(p.amount);
      const pDate = p.payment_date.getTime();
      const daysDiff = Math.abs(txnDate - pDate) / (1000 * 60 * 60 * 24);

      // Amount within ±0.01, date within ±5 days
      if (Math.abs(txnAmount - pAmount) <= 0.01 && daysDiff <= 5) {
        matched.push({ bankTxnId: txn.id, paymentId: p.id });
        matchedPaymentIds.add(p.id);
        unmatchedBankTxnIds.delete(txn.id);
        break;
      }
    }
  }

  // ── Pass 2: Amount + Date match ──
  for (const txn of bankTxns) {
    if (!unmatchedBankTxnIds.has(txn.id)) continue;

    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const amtKey = txnAmount.toFixed(2);
    const candidates = paymentsByAmount.get(amtKey);
    if (!candidates) continue;

    const txnDate = txn.transaction_date.getTime();
    const isDebit = txn.debit !== null;

    // Filter: same direction, within ±3 days, not already matched
    const viable = candidates.filter((p) => {
      if (matchedPaymentIds.has(p.id)) return false;
      const pDate = p.payment_date.getTime();
      const daysDiff = Math.abs(txnDate - pDate) / (1000 * 60 * 60 * 24);
      // Debit = outgoing, Credit = incoming
      const directionMatch = isDebit ? p.direction === 'outgoing' : p.direction === 'incoming';
      return daysDiff <= 3 && directionMatch;
    });

    // Only auto-match if exactly 1 candidate
    if (viable.length === 1) {
      matched.push({ bankTxnId: txn.id, paymentId: viable[0].id });
      matchedPaymentIds.add(viable[0].id);
      unmatchedBankTxnIds.delete(txn.id);
    }
  }

  // ── Pass 3: Supplier name match ──
  for (const txn of bankTxns) {
    if (!unmatchedBankTxnIds.has(txn.id)) continue;

    const txnDesc = txn.description.toLowerCase();
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const isDebit = txn.debit !== null;

    // Find payments where supplier name appears in the bank description
    const nameMatches = payments.filter((p) => {
      if (matchedPaymentIds.has(p.id)) return false;

      const directionMatch = isDebit ? p.direction === 'outgoing' : p.direction === 'incoming';
      if (!directionMatch) return false;
      if (Math.abs(Number(p.amount) - txnAmount) > 0.01) return false;

      // Check supplier name and aliases
      if (!p.supplier) return false; // Skip employee payments for name matching
      const names = [p.supplier.name, ...p.supplier.aliases.map((a) => a.alias)];
      return names.some((name) => {
        const n = name.toLowerCase();
        // Check if first 3+ words of supplier name appear in description
        return n.length >= 3 && txnDesc.includes(n);
      });
    });

    if (nameMatches.length === 1) {
      matched.push({ bankTxnId: txn.id, paymentId: nameMatches[0].id });
      matchedPaymentIds.add(nameMatches[0].id);
      unmatchedBankTxnIds.delete(txn.id);
    }
  }

  // ── Bulk update matched transactions ──
  const now = new Date();
  if (matched.length > 0) {
    await prisma.$transaction(
      matched.map((m) =>
        prisma.bankTransaction.update({
          where: { id: m.bankTxnId },
          data: {
            matched_payment_id: m.paymentId,
            recon_status: 'matched',
            matched_at: now,
          },
        })
      )
    );
  }

  return {
    matched: matched.length,
    unmatched: unmatchedBankTxnIds.size,
  };
}
