import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id: claimId } = await params;

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { firm_id: true, type: true },
  });
  if (!claim || !firmIds?.includes(claim.firm_id) || claim.type !== 'receipt') {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  await prisma.paymentReceipt.deleteMany({ where: { claim_id: claimId } });

  await prisma.claim.update({
    where: { id: claimId },
    data: { payment_status: 'unpaid' },
  });

  return NextResponse.json({ success: true });
}
