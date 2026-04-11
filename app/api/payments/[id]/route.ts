import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { recalcClaimPayment } from '@/lib/payment-utils';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id: paymentId } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      receipts: { select: { claim_id: true } },
      allocations: { select: { id: true } },
    },
  });
  if (!payment || (firmIds && !firmIds.includes(payment.firm_id))) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Only allow deleting payments with no allocations (orphaned credit)
  if (payment.allocations.length > 0) {
    return NextResponse.json({ error: 'Cannot delete payment with active allocations. Remove allocations first.' }, { status: 400 });
  }

  // Unlink from bank transaction if matched
  const bankTxn = await prisma.bankTransaction.findFirst({
    where: { matched_payment_id: paymentId },
  });
  if (bankTxn) {
    if (bankTxn.recon_status === 'manually_matched') {
      await reverseBankReconJV(bankTxn.id, session.user.id);
    }
    await prisma.bankTransaction.update({
      where: { id: bankTxn.id },
      data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
    });
  }

  const claimIds = payment.receipts.map(r => r.claim_id);

  // Delete receipt links
  await prisma.paymentReceipt.deleteMany({ where: { payment_id: paymentId } });

  // Delete the payment
  await prisma.payment.delete({ where: { id: paymentId } });

  // Recalc claim payment status
  for (const claimId of claimIds) {
    await recalcClaimPayment(claimId);
  }

  await auditLog({
    firmId: payment.firm_id,
    tableName: 'Payment',
    recordId: paymentId,
    action: 'delete',
    oldValues: { amount: Number(payment.amount), supplier_id: payment.supplier_id, payment_date: payment.payment_date },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ success: true });
}
