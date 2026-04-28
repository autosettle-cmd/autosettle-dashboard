import { prisma } from './prisma';

interface MatchResult {
  matched: number;
  unmatched: number;
}

/**
 * Auto-match bank transactions to approved invoices (purchase & sales) and claims.
 * Uses BankTransactionInvoice join table for invoice matches, direct FK for claims.
 *
 * Passes with decreasing confidence:
 *   Pass 1: Invoice number in bank description + exact amount
 *   Pass 2: Exact amount + date within ±3 days (only if 1 candidate)
 *   Pass 3: Supplier/buyer name in bank description + exact amount
 *   Pass 4: Exact amount only (only if 1 candidate across all types)
 */
export async function autoMatchTransactions(
  firmId: string,
  bankStatementId: string
): Promise<MatchResult> {
  const bankTxns = await prisma.bankTransaction.findMany({
    where: { bank_statement_id: bankStatementId, recon_status: 'unmatched' },
  });

  if (bankTxns.length === 0) return { matched: 0, unmatched: 0 };

  // Load approved unpaid supplier invoices (purchase type)
  const supplierInvoices = await prisma.invoice.findMany({
    where: {
      firm_id: firmId,
      type: 'purchase',
      approval: 'approved',
      payment_status: { in: ['unpaid', 'partially_paid'] },
      // Exclude invoices already linked to a bank transaction
      bankTxnAllocations: { none: {} },
    },
    select: {
      id: true, invoice_number: true, total_amount: true, amount_paid: true,
      issue_date: true, vendor_name_raw: true,
      supplier: { select: { name: true, aliases: { select: { alias: true } } } },
    },
  });

  // Load approved unpaid sales invoices
  const salesInvoices = await prisma.invoice.findMany({
    where: {
      firm_id: firmId,
      type: 'sales',
      approval: 'approved',
      payment_status: { in: ['unpaid', 'partially_paid'] },
      bankTxnAllocations: { none: {} },
    },
    select: {
      id: true, invoice_number: true, total_amount: true, amount_paid: true,
      issue_date: true, vendor_name_raw: true,
      supplier: { select: { name: true, aliases: { select: { alias: true } } } },
    },
  });

  // Load reviewed unpaid employee claims (for reimbursement matching)
  const claims = await prisma.claim.findMany({
    where: {
      firm_id: firmId,
      status: 'reviewed',
      payment_status: 'unpaid',
      type: { in: ['claim', 'mileage'] },
      matched_bank_txn_id: null,
    },
    select: {
      id: true, amount: true, claim_date: true, merchant: true, receipt_number: true,
      employee: { select: { name: true } },
    },
  });

  // Track what's been matched to avoid double-matching
  const matchedTxnIds = new Set<string>();
  const matchedInvoiceIds = new Set<string>();
  const matchedSalesInvoiceIds = new Set<string>();
  const matchedClaimIds = new Set<string>();
  const updates: { txnId: string; data: { notes?: string }; invoiceId?: string; invoiceAmount?: number }[] = [];
  const claimUpdates: { txnId: string; claimId: string; claimAmount: number; notes: string }[] = [];

  // Helper: get remaining amount for an invoice
  const remaining = (total: unknown, paid: unknown) => Number(total) - Number(paid);

  // Helper: check if any name word appears in description
  const nameInDesc = (names: (string | null | undefined)[], descLower: string) => {
    return names.filter(Boolean).some(n => {
      const words = n!.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
      return words.some(w => descLower.includes(w));
    });
  };

  // ── Pass 1: Invoice number in bank description + exact amount ──────────
  for (const txn of bankTxns) {
    if (matchedTxnIds.has(txn.id)) continue;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const descLower = txn.description.toLowerCase();

    if (txn.debit) {
      // Outgoing → supplier invoices
      for (const inv of supplierInvoices) {
        if (matchedInvoiceIds.has(inv.id)) continue;
        if (!inv.invoice_number) continue;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) continue;
        if (descLower.includes(inv.invoice_number.toLowerCase())) {
          const rem = remaining(inv.total_amount, inv.amount_paid);
          updates.push({ txnId: txn.id, data: { notes: `Pass 1: invoice# ${inv.invoice_number}` }, invoiceId: inv.id, invoiceAmount: rem });
          matchedTxnIds.add(txn.id);
          matchedInvoiceIds.add(inv.id);
          break;
        }
      }
    } else if (txn.credit) {
      // Incoming → sales invoices
      for (const inv of salesInvoices) {
        if (matchedSalesInvoiceIds.has(inv.id)) continue;
        if (!inv.invoice_number) continue;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) continue;
        if (descLower.includes(inv.invoice_number.toLowerCase())) {
          const rem = remaining(inv.total_amount, inv.amount_paid);
          updates.push({ txnId: txn.id, data: { notes: `Pass 1: invoice# ${inv.invoice_number}` }, invoiceId: inv.id, invoiceAmount: rem });
          matchedTxnIds.add(txn.id);
          matchedSalesInvoiceIds.add(inv.id);
          break;
        }
      }
    }
  }

  // ── Pass 2: Exact amount + date within ±3 days (only if 1 candidate) ──
  for (const txn of bankTxns) {
    if (matchedTxnIds.has(txn.id)) continue;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const txnDate = txn.transaction_date.getTime();
    const DAY3 = 3 * 86400000;

    if (txn.debit) {
      const candidates = supplierInvoices.filter(inv => {
        if (matchedInvoiceIds.has(inv.id)) return false;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) return false;
        return Math.abs(inv.issue_date.getTime() - txnDate) <= DAY3;
      });
      if (candidates.length === 1) {
        const rem = remaining(candidates[0].total_amount, candidates[0].amount_paid);
        updates.push({ txnId: txn.id, data: { notes: `Pass 2: amount+date` }, invoiceId: candidates[0].id, invoiceAmount: rem });
        matchedTxnIds.add(txn.id);
        matchedInvoiceIds.add(candidates[0].id);
      }

      // Also check claims for reimbursements
      if (!matchedTxnIds.has(txn.id)) {
        const claimCandidates = claims.filter(c => {
          if (matchedClaimIds.has(c.id)) return false;
          if (Math.abs(Number(c.amount) - txnAmount) > 0.01) return false;
          return Math.abs(c.claim_date.getTime() - txnDate) <= DAY3;
        });
        if (claimCandidates.length === 1) {
          claimUpdates.push({ txnId: txn.id, claimId: claimCandidates[0].id, claimAmount: Number(claimCandidates[0].amount), notes: `Pass 2: claim amount+date` });
          matchedTxnIds.add(txn.id);
          matchedClaimIds.add(claimCandidates[0].id);
        }
      }
    } else if (txn.credit) {
      const candidates = salesInvoices.filter(inv => {
        if (matchedSalesInvoiceIds.has(inv.id)) return false;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) return false;
        return Math.abs(inv.issue_date.getTime() - txnDate) <= DAY3;
      });
      if (candidates.length === 1) {
        const rem = remaining(candidates[0].total_amount, candidates[0].amount_paid);
        updates.push({ txnId: txn.id, data: { notes: `Pass 2: amount+date` }, invoiceId: candidates[0].id, invoiceAmount: rem });
        matchedTxnIds.add(txn.id);
        matchedSalesInvoiceIds.add(candidates[0].id);
      }
    }
  }

  // ── Pass 3: Supplier/buyer name in description + exact amount ──────────
  for (const txn of bankTxns) {
    if (matchedTxnIds.has(txn.id)) continue;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const descLower = txn.description.toLowerCase();

    if (txn.debit) {
      const candidates = supplierInvoices.filter(inv => {
        if (matchedInvoiceIds.has(inv.id)) return false;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) return false;
        return nameInDesc([inv.vendor_name_raw, inv.supplier?.name, ...(inv.supplier?.aliases?.map(a => a.alias) ?? [])], descLower);
      });
      if (candidates.length === 1) {
        const rem = remaining(candidates[0].total_amount, candidates[0].amount_paid);
        updates.push({ txnId: txn.id, data: { notes: `Pass 3: name+amount` }, invoiceId: candidates[0].id, invoiceAmount: rem });
        matchedTxnIds.add(txn.id);
        matchedInvoiceIds.add(candidates[0].id);
      }

      // Claims — check employee name or merchant in description
      if (!matchedTxnIds.has(txn.id)) {
        const claimCandidates = claims.filter(c => {
          if (matchedClaimIds.has(c.id)) return false;
          if (Math.abs(Number(c.amount) - txnAmount) > 0.01) return false;
          return nameInDesc([c.employee.name, c.merchant], descLower);
        });
        if (claimCandidates.length === 1) {
          claimUpdates.push({ txnId: txn.id, claimId: claimCandidates[0].id, claimAmount: Number(claimCandidates[0].amount), notes: `Pass 3: claim name+amount` });
          matchedTxnIds.add(txn.id);
          matchedClaimIds.add(claimCandidates[0].id);
        }
      }
    } else if (txn.credit) {
      const candidates = salesInvoices.filter(inv => {
        if (matchedSalesInvoiceIds.has(inv.id)) return false;
        const rem = remaining(inv.total_amount, inv.amount_paid);
        if (Math.abs(rem - txnAmount) > 0.01) return false;
        return nameInDesc([inv.vendor_name_raw, inv.supplier?.name, ...(inv.supplier?.aliases?.map(a => a.alias) ?? [])], descLower);
      });
      if (candidates.length === 1) {
        const rem = remaining(candidates[0].total_amount, candidates[0].amount_paid);
        updates.push({ txnId: txn.id, data: { notes: `Pass 3: name+amount` }, invoiceId: candidates[0].id, invoiceAmount: rem });
        matchedTxnIds.add(txn.id);
        matchedSalesInvoiceIds.add(candidates[0].id);
      }
    }
  }

  // ── Pass 4: Exact amount only (only if 1 candidate) ────────────────────
  for (const txn of bankTxns) {
    if (matchedTxnIds.has(txn.id)) continue;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);

    if (txn.debit) {
      // Check invoices + claims together — only match if exactly 1 total candidate
      const invCandidates = supplierInvoices.filter(inv => {
        if (matchedInvoiceIds.has(inv.id)) return false;
        return Math.abs(remaining(inv.total_amount, inv.amount_paid) - txnAmount) <= 0.01;
      });
      const claimCandidates = claims.filter(c => {
        if (matchedClaimIds.has(c.id)) return false;
        return Math.abs(Number(c.amount) - txnAmount) <= 0.01;
      });
      const total = invCandidates.length + claimCandidates.length;
      if (total === 1) {
        if (invCandidates.length === 1) {
          const rem = remaining(invCandidates[0].total_amount, invCandidates[0].amount_paid);
          updates.push({ txnId: txn.id, data: { notes: `Pass 4: amount only` }, invoiceId: invCandidates[0].id, invoiceAmount: rem });
          matchedTxnIds.add(txn.id);
          matchedInvoiceIds.add(invCandidates[0].id);
        } else {
          claimUpdates.push({ txnId: txn.id, claimId: claimCandidates[0].id, claimAmount: Number(claimCandidates[0].amount), notes: `Pass 4: claim amount only` });
          matchedTxnIds.add(txn.id);
          matchedClaimIds.add(claimCandidates[0].id);
        }
      }
    } else if (txn.credit) {
      const candidates = salesInvoices.filter(inv => {
        if (matchedSalesInvoiceIds.has(inv.id)) return false;
        return Math.abs(remaining(inv.total_amount, inv.amount_paid) - txnAmount) <= 0.01;
      });
      if (candidates.length === 1) {
        const rem = remaining(candidates[0].total_amount, candidates[0].amount_paid);
        updates.push({ txnId: txn.id, data: { notes: `Pass 4: amount only` }, invoiceId: candidates[0].id, invoiceAmount: rem });
        matchedTxnIds.add(txn.id);
        matchedSalesInvoiceIds.add(candidates[0].id);
      }
    }
  }

  // ── Bulk update matched transactions ──
  const now = new Date();
  const totalMatched = updates.length + claimUpdates.length;
  if (totalMatched > 0) {
    const txnOps = updates.map((u) =>
      prisma.bankTransaction.update({
        where: { id: u.txnId },
        data: { ...u.data, recon_status: 'matched', matched_at: now },
      })
    );
    // Create BankTransactionInvoice records for invoice matches
    const invoiceAllocOps = updates
      .filter(u => u.invoiceId)
      .map(u => prisma.bankTransactionInvoice.create({
        data: {
          bank_transaction_id: u.txnId,
          invoice_id: u.invoiceId!,
          amount: u.invoiceAmount!,
        },
      }));
    // For claim matches: update bank txn status + create join table record + set matched_bank_txn_id on claim
    const claimTxnOps = claimUpdates.flatMap((u) => [
      prisma.bankTransaction.update({
        where: { id: u.txnId },
        data: { recon_status: 'matched', matched_at: now, notes: u.notes },
      }),
      prisma.bankTransactionClaim.create({
        data: {
          bank_transaction_id: u.txnId,
          claim_id: u.claimId,
          amount: u.claimAmount,
        },
      }),
      prisma.claim.update({
        where: { id: u.claimId },
        data: { matched_bank_txn_id: u.txnId },
      }),
    ]);
    await prisma.$transaction([...txnOps, ...invoiceAllocOps, ...claimTxnOps]);
  }

  return {
    matched: totalMatched,
    unmatched: bankTxns.length - matchedTxnIds.size,
  };
}
