import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bankTransactionId } = await request.json();
  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || txn.bankStatement.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }

  // Reverse bank recon JV before unmatching
  const jvResult = await reverseBankReconJV(bankTransactionId, session.user.id);

  // Clean up auto-created Payment if it was created by bank recon matching
  if (txn.matched_payment_id) {
    const payment = await prisma.payment.findUnique({
      where: { id: txn.matched_payment_id },
      select: { id: true, notes: true },
    });
    if (payment?.notes?.startsWith('Auto-matched from receipt')) {
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
    }
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      matched_payment_id: null,
      recon_status: 'unmatched',
      matched_at: null,
      matched_by: null,
    },
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
