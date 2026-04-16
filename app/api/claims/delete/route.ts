import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { reverseJVsForSource } from '@/lib/journal-entries';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();
  const { claimIds } = body as { claimIds: string[] };

  if (!claimIds?.length) {
    return NextResponse.json({ data: null, error: 'claimIds is required' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { id: { in: claimIds } };
  if (firmIds) where.firm_id = { in: firmIds };

  const claims = await prisma.claim.findMany({
    where,
    select: { id: true, firm_id: true, merchant: true, amount: true, status: true, approval: true, payment_status: true, matched_bank_txn_id: true },
  });

  if (claims.length === 0) {
    return NextResponse.json({ data: null, error: 'No claims found' }, { status: 404 });
  }

  // Block delete only if claim has linked payments (those need manual removal)
  const withPayments = await prisma.paymentReceipt.findMany({
    where: { claim_id: { in: claimIds } },
    select: { claim_id: true },
  });
  if (withPayments.length > 0) {
    return NextResponse.json({ data: null, error: 'Cannot delete — claims have linked payments. Remove payments first.' }, { status: 400 });
  }

  // Cascade: reverse JVs for approved claims
  for (const claim of claims) {
    if (claim.approval === 'approved') {
      await reverseJVsForSource('claim_approval', claim.id, session.user.id);
    }
  }

  // Cascade: unlink from bank transactions and reverse bank recon JVs
  for (const claim of claims) {
    if (claim.matched_bank_txn_id) {
      await reverseJVsForSource('bank_recon', claim.matched_bank_txn_id, session.user.id);
      await prisma.bankTransactionClaim.deleteMany({ where: { claim_id: claim.id } });
      await prisma.bankTransaction.update({
        where: { id: claim.matched_bank_txn_id },
        data: { recon_status: 'unmatched', matched_at: null, matched_by: null },
      });
    }
  }

  // Cascade: remove invoice receipt links and recalc invoice paid amounts
  const invoiceLinks = await prisma.invoiceReceiptLink.findMany({
    where: { claim_id: { in: claimIds } },
    select: { id: true, invoice_id: true },
  });
  if (invoiceLinks.length > 0) {
    await prisma.invoiceReceiptLink.deleteMany({ where: { claim_id: { in: claimIds } } });
    const affectedInvoiceIds = Array.from(new Set(invoiceLinks.map(l => l.invoice_id)));
    for (const invId of affectedInvoiceIds) {
      await recalcInvoicePaid(invId);
    }
  }

  await prisma.claim.deleteMany({ where: { id: { in: claims.map(c => c.id) } } });

  for (const claim of claims) {
    auditLog({
      firmId: claim.firm_id,
      tableName: 'Claim',
      recordId: claim.id,
      action: 'delete',
      oldValues: { merchant: claim.merchant, amount: Number(claim.amount), status: claim.status, approval: claim.approval },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { deleted: claims.length }, error: null });
}
