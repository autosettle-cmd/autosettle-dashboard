import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const firmIds = await getAccountantFirmIds(session.user.id);

    const { bankTransactionId, description } = await request.json();
    if (!bankTransactionId || !description) {
      return NextResponse.json({ data: null, error: 'bankTransactionId and description required' }, { status: 400 });
    }

    const txn = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      include: { bankStatement: { select: { firm_id: true } } },
    });
    if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
      return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
    }

    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { description },
    });

    return NextResponse.json({ data: { id: bankTransactionId }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
