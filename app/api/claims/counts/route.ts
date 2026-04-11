import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const scope = firmScope(firmIds, firmId);

  const [claim, receipt, mileage, claimPending, receiptPending, mileagePending] = await Promise.all([
    prisma.claim.count({ where: { ...scope, type: 'claim' } }),
    prisma.claim.count({ where: { ...scope, type: 'receipt' } }),
    prisma.claim.count({ where: { ...scope, type: 'mileage' } }),
    prisma.claim.count({ where: { ...scope, type: 'claim', approval: 'pending_approval' } }),
    prisma.claim.count({ where: { ...scope, type: 'receipt', approval: 'pending_approval' } }),
    prisma.claim.count({ where: { ...scope, type: 'mileage', approval: 'pending_approval' } }),
  ]);

  return NextResponse.json({ data: { claim, receipt, mileage, claimPending, receiptPending, mileagePending }, error: null });
}
