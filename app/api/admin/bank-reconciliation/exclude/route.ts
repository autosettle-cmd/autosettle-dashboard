import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bankTransactionId, notes } = await request.json();
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

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      recon_status: 'excluded',
      matched_payment_id: null,
      matched_invoice_id: null,
      matched_sales_invoice_id: null,
      matched_claim_id: null,
      notes: notes || null,
      matched_at: new Date(),
      matched_by: session.user.id,
    },
  });

  return NextResponse.json({ data: { id: updated.id, recon_status: updated.recon_status }, error: null });
}
