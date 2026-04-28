import { prisma } from './prisma';
import { auditLog } from './audit';

// ─── Blocker Check (shared pre-flight) ────────────────────────────────────────

export interface DeleteBlocker {
  label: string;   // e.g. "Approved"
  detail: string;  // e.g. "Revert approval first"
}

export async function getInvoiceBlockers(invoiceId: string): Promise<DeleteBlocker[]> {
  const blockers: DeleteBlocker[] = [];

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, approval: true },
  });
  if (!invoice) return blockers;

  if (invoice.status === 'reviewed' || invoice.approval === 'approved') {
    blockers.push({ label: 'Approved', detail: 'Revert approval first' });
  }

  const [allocCount, bankTxnCount, receiptLinkCount] = await Promise.all([
    prisma.paymentAllocation.count({ where: { invoice_id: invoiceId } }),
    prisma.bankTransactionInvoice.count({ where: { invoice_id: invoiceId } }),
    prisma.invoiceReceiptLink.count({ where: { invoice_id: invoiceId } }),
  ]);

  if (allocCount > 0) {
    blockers.push({ label: `${allocCount} payment allocation${allocCount > 1 ? 's' : ''}`, detail: 'Remove allocations first' });
  }
  if (bankTxnCount > 0) {
    blockers.push({ label: `${bankTxnCount} bank transaction match${bankTxnCount > 1 ? 'es' : ''}`, detail: 'Unmatch from bank recon first' });
  }
  if (receiptLinkCount > 0) {
    blockers.push({ label: `${receiptLinkCount} receipt link${receiptLinkCount > 1 ? 's' : ''}`, detail: 'Remove receipt links first' });
  }

  return blockers;
}

export async function getClaimBlockers(claimIds: string[]): Promise<DeleteBlocker[]> {
  const blockers: DeleteBlocker[] = [];

  const claims = await prisma.claim.findMany({
    where: { id: { in: claimIds } },
    select: { id: true, approval: true, matched_bank_txn_id: true },
  });

  const approved = claims.filter(c => c.approval === 'approved');
  if (approved.length > 0) {
    blockers.push({ label: `${approved.length} approved claim${approved.length > 1 ? 's' : ''}`, detail: 'Revert approval first' });
  }

  const withBankMatch = claims.filter(c => c.matched_bank_txn_id);
  if (withBankMatch.length > 0) {
    blockers.push({ label: `${withBankMatch.length} bank recon match${withBankMatch.length > 1 ? 'es' : ''}`, detail: 'Unmatch from bank recon first' });
  }

  const [paymentCount, bankAllocCount, receiptLinkCount] = await Promise.all([
    prisma.paymentReceipt.count({ where: { claim_id: { in: claimIds } } }),
    prisma.bankTransactionClaim.count({ where: { claim_id: { in: claimIds } } }),
    prisma.invoiceReceiptLink.count({ where: { claim_id: { in: claimIds } } }),
  ]);

  if (paymentCount > 0) {
    blockers.push({ label: `${paymentCount} linked payment${paymentCount > 1 ? 's' : ''}`, detail: 'Remove payments first' });
  }
  if (bankAllocCount > 0) {
    blockers.push({ label: `${bankAllocCount} bank transaction link${bankAllocCount > 1 ? 's' : ''}`, detail: 'Unmatch from bank recon first' });
  }
  if (receiptLinkCount > 0) {
    blockers.push({ label: `${receiptLinkCount} invoice link${receiptLinkCount > 1 ? 's' : ''}`, detail: 'Remove invoice links first' });
  }

  return blockers;
}

export async function getPaymentBlockers(paymentId: string): Promise<DeleteBlocker[]> {
  const blockers: DeleteBlocker[] = [];

  const [allocCount, receiptCount] = await Promise.all([
    prisma.paymentAllocation.count({ where: { payment_id: paymentId } }),
    prisma.paymentReceipt.count({ where: { payment_id: paymentId } }),
  ]);

  if (allocCount > 0) {
    blockers.push({ label: `${allocCount} invoice allocation${allocCount > 1 ? 's' : ''}`, detail: 'Remove allocations first' });
  }
  if (receiptCount > 0) {
    blockers.push({ label: `${receiptCount} claim link${receiptCount > 1 ? 's' : ''}`, detail: 'Remove claim links first' });
  }

  const bankTxn = await prisma.bankTransaction.findFirst({
    where: { matched_payment_id: paymentId },
    select: { id: true },
  });
  if (bankTxn) {
    blockers.push({ label: '1 bank transaction match', detail: 'Unmatch from bank recon first' });
  }

  return blockers;
}

// ─── Soft Delete (only succeeds if zero blockers) ─────────────────────────────

export interface SoftDeleteResult {
  deleted: number;
  blockers?: DeleteBlocker[];
}

export async function softDeleteInvoice(
  invoiceId: string,
  firmId: string,
  userId: string,
  userName: string | null
): Promise<SoftDeleteResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { vendor_name_raw: true, invoice_number: true, total_amount: true, status: true },
  });
  if (!invoice) return { deleted: 0 };

  const blockers = await getInvoiceBlockers(invoiceId);
  if (blockers.length > 0) return { deleted: 0, blockers };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { deleted_at: new Date(), deleted_by: userId },
  });

  await auditLog({
    firmId, tableName: 'Invoice', recordId: invoiceId, action: 'soft_delete',
    oldValues: { vendor: invoice.vendor_name_raw, invoice_number: invoice.invoice_number, total_amount: Number(invoice.total_amount), status: invoice.status },
    userId, userName,
  });

  return { deleted: 1 };
}

export async function softDeleteClaims(
  claimIds: string[],
  userId: string,
  userName: string | null
): Promise<SoftDeleteResult> {
  const claims = await prisma.claim.findMany({
    where: { id: { in: claimIds } },
    select: { id: true, firm_id: true, merchant: true, amount: true, status: true, approval: true },
  });
  if (claims.length === 0) return { deleted: 0 };

  const blockers = await getClaimBlockers(claimIds);
  if (blockers.length > 0) return { deleted: 0, blockers };

  const now = new Date();
  await prisma.claim.updateMany({
    where: { id: { in: claims.map(c => c.id) } },
    data: { deleted_at: now, deleted_by: userId },
  });

  for (const claim of claims) {
    auditLog({
      firmId: claim.firm_id, tableName: 'Claim', recordId: claim.id, action: 'soft_delete',
      oldValues: { merchant: claim.merchant, amount: Number(claim.amount), status: claim.status, approval: claim.approval },
      userId, userName,
    });
  }

  return { deleted: claims.length };
}

export async function softDeletePayment(
  paymentId: string,
  userId: string,
  userName: string | null
): Promise<SoftDeleteResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { firm_id: true, amount: true, supplier_id: true, payment_date: true },
  });
  if (!payment) return { deleted: 0 };

  const blockers = await getPaymentBlockers(paymentId);
  if (blockers.length > 0) return { deleted: 0, blockers };

  await prisma.payment.update({
    where: { id: paymentId },
    data: { deleted_at: new Date(), deleted_by: userId },
  });

  await auditLog({
    firmId: payment.firm_id, tableName: 'Payment', recordId: paymentId, action: 'soft_delete',
    oldValues: { amount: Number(payment.amount), supplier_id: payment.supplier_id, payment_date: payment.payment_date },
    userId, userName,
  });

  return { deleted: 1 };
}
