import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';

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

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      recon_status: updated.recon_status,
      ...(jvResult.warning && { jv_warning: jvResult.warning }),
    },
    error: null,
  });
}
