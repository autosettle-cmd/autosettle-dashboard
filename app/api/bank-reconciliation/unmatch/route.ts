import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionId } = await request.json();
  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }

  const jvResult = await reverseBankReconJV(bankTransactionId, session.user.id);

  // Clean up auto-created Payment if it was created by bank recon matching
  // (has notes starting with "Auto-matched from receipt")
  if (txn.matched_payment_id) {
    const payment = await prisma.payment.findUnique({
      where: { id: txn.matched_payment_id },
      select: { id: true, notes: true },
    });
    if (payment?.notes?.startsWith('Auto-matched from receipt')) {
      // Delete PaymentReceipt links first (cascade would handle but be explicit)
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
    }
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      recon_status: updated.recon_status,
      ...(jvResult.error && { jv_warning: jvResult.error }),
    },
    error: null,
  });
}
