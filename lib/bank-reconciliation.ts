import { prisma } from './prisma';

interface MatchResult {
  matched: number;
  unmatched: number;
}

/**
 * Auto-match bank transactions to existing Payment records and approved Receipts.
 * All matches are firm-scoped — only matches within the same firm.
 * Runs 4 passes with decreasing confidence:
 *   Pass 1: Reference match (exact ref + amount within ±0.01 + date within ±5 days)
 *   Pass 2: Amount + Date match (exact amount + date within ±3 days, only if 1 candidate)
 *   Pass 3: Supplier name match (description contains supplier name + amount match)
 *   Pass 4: Receipt match (approved receipts by amount + date, auto-creates Payment bridge)
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

  // ── Pass 4: Match against approved receipts (Claims with type='receipt') ──
  // Receipts don't have Payment records yet — create one when matched
  if (unmatchedBankTxnIds.size > 0) {
    // Find receipts not already linked to a Payment (check both PaymentReceipt AND Payment notes)
    const existingPaymentClaimIds = (await prisma.payment.findMany({
      where: { firm_id: firmId, notes: { contains: '[claim:' } },
      select: { notes: true },
    })).map(p => p.notes?.match(/\[claim:([^\]]+)\]/)?.[1]).filter(Boolean) as string[];

    const receipts = await prisma.claim.findMany({
      where: {
        firm_id: firmId,
        type: 'receipt',
        approval: 'approved',
        payment_status: 'unpaid',
        paymentReceipts: { none: {} },
        ...(existingPaymentClaimIds.length > 0 && { id: { notIn: existingPaymentClaimIds } }),
      },
      select: {
        id: true, amount: true, claim_date: true, merchant: true, receipt_number: true, employee_id: true,
      },
    });

    // Build receipt lookup by amount
    const receiptsByAmount = new Map<string, typeof receipts>();
    for (const r of receipts) {
      const amtKey = Number(r.amount).toFixed(2);
      const list = receiptsByAmount.get(amtKey) ?? [];
      list.push(r);
      receiptsByAmount.set(amtKey, list);
    }

    for (const txn of bankTxns) {
      if (!unmatchedBankTxnIds.has(txn.id)) continue;

      const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
      const amtKey = txnAmount.toFixed(2);
      const candidates = receiptsByAmount.get(amtKey);
      if (!candidates) continue;

      const txnDate = txn.transaction_date.getTime();

      // Filter: date within ±5 days, pick closest date match
      const viable = candidates
        .map((r) => {
          const daysDiff = Math.abs(txnDate - r.claim_date.getTime()) / (1000 * 60 * 60 * 24);
          return { receipt: r, daysDiff };
        })
        .filter((v) => v.daysDiff <= 5)
        .sort((a, b) => a.daysDiff - b.daysDiff);

      if (viable.length === 1 || (viable.length > 1 && viable[0].daysDiff < viable[1].daysDiff)) {
        const receipt = viable[0].receipt;
        // Determine direction from bank transaction
        const direction = txn.credit !== null ? 'incoming' : 'outgoing';

        // Create Payment record as bridge (PaymentReceipt link deferred to confirm)
        const payment = await prisma.payment.create({
          data: {
            firm_id: firmId,
            employee_id: receipt.employee_id,
            amount: receipt.amount,
            payment_date: txn.transaction_date,
            reference: receipt.receipt_number,
            notes: `Auto-matched from receipt: ${receipt.merchant} [claim:${receipt.id}]`,
            direction: direction as 'incoming' | 'outgoing',
          },
        });

        matched.push({ bankTxnId: txn.id, paymentId: payment.id });
        unmatchedBankTxnIds.delete(txn.id);
        // Remove from candidates so it doesn't match again
        const idx = candidates.indexOf(receipt);
        if (idx >= 0) candidates.splice(idx, 1);
      }
    }
  }

  // ── Pass 5: Match against approved invoices by amount + supplier name ──
  {
    // Load approved unpaid supplier invoices for outgoing (credit) transactions
    const supplierInvoices = await prisma.invoice.findMany({
      where: { firm_id: firmId, approval: 'approved', payment_status: { in: ['unpaid', 'partially_paid'] } },
      select: {
        id: true, total_amount: true, amount_paid: true, issue_date: true, vendor_name_raw: true,
        supplier: { select: { name: true, aliases: { select: { alias: true } } } },
      },
    });

    // Load approved unpaid sales invoices for incoming (debit) transactions
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: { firm_id: firmId, approval: 'approved', payment_status: { in: ['unpaid', 'partially_paid'] } },
      select: {
        id: true, total_amount: true, amount_paid: true, issue_date: true, invoice_number: true,
        buyer: { select: { name: true, aliases: { select: { alias: true } } } },
      },
    });

    for (const txn of bankTxns) {
      if (!unmatchedBankTxnIds.has(txn.id)) continue;

      const txnAmount = Number(txn.credit ?? txn.debit ?? 0);
      const descLower = txn.description.toLowerCase();

      if (txn.debit) {
        // Outgoing = debit in bank (withdrawal) → match to supplier invoices
        const candidates = supplierInvoices.filter(inv => {
          const remaining = Number(inv.total_amount) - Number(inv.amount_paid);
          if (Math.abs(remaining - txnAmount) > 0.01) return false;
          // Check if description contains supplier name or aliases
          const names = [inv.vendor_name_raw, inv.supplier?.name, ...(inv.supplier?.aliases?.map(a => a.alias) ?? [])].filter(Boolean);
          return names.some(n => descLower.includes(n!.toLowerCase()));
        });

        if (candidates.length === 1) {
          // Mark as suggested with invoice reference in notes
          await prisma.bankTransaction.update({
            where: { id: txn.id },
            data: { recon_status: 'matched', matched_at: new Date(), notes: `[invoice:${candidates[0].id}]` },
          });
          unmatchedBankTxnIds.delete(txn.id);
          matched.push({ bankTxnId: txn.id, paymentId: '' }); // count only
        }
      } else if (txn.credit) {
        // Incoming = credit in bank (deposit) → match to sales invoices
        const candidates = salesInvoices.filter(inv => {
          const remaining = Number(inv.total_amount) - Number(inv.amount_paid);
          if (Math.abs(remaining - txnAmount) > 0.01) return false;
          const names = [inv.buyer?.name, ...(inv.buyer?.aliases?.map(a => a.alias) ?? [])].filter(Boolean);
          return names.some(n => descLower.includes(n!.toLowerCase()));
        });

        if (candidates.length === 1) {
          await prisma.bankTransaction.update({
            where: { id: txn.id },
            data: { recon_status: 'matched', matched_at: new Date(), notes: `[sales_invoice:${candidates[0].id}]` },
          });
          unmatchedBankTxnIds.delete(txn.id);
          matched.push({ bankTxnId: txn.id, paymentId: '' }); // count only
        }
      }
    }
  }

  // ── Bulk update matched transactions (skip Pass 5 which already updated) ──
  const now = new Date();
  const paymentMatches = matched.filter(m => m.paymentId);
  if (paymentMatches.length > 0) {
    await prisma.$transaction(
      paymentMatches.map((m) =>
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
