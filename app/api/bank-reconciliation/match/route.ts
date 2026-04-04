import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionId, paymentId } = await request.json();
  if (!bankTransactionId || !paymentId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId and paymentId required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { firm_id: true } });
  if (!payment || (firmIds && !firmIds.includes(payment.firm_id))) {
    return NextResponse.json({ data: null, error: 'Payment not found' }, { status: 404 });
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { matched_payment_id: paymentId, recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
  });
  return NextResponse.json({ data: { id: updated.id, recon_status: updated.recon_status }, error: null });
}
