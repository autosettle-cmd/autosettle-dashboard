import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);

    const { searchParams } = new URL(request.url);
    const firmId = searchParams.get('firmId');
    const scope = firmScope(firmIds, firmId);

    // Single groupBy replaces 6 separate count queries
    const grouped = await prisma.claim.groupBy({
      by: ['type', 'approval'],
      where: scope,
      _count: true,
    });

    const count = (type: string, approval?: string) =>
      grouped.filter(g => g.type === type && (!approval || g.approval === approval)).reduce((s, g) => s + g._count, 0);

    return NextResponse.json({
      data: {
        claim: count('claim'),
        receipt: count('receipt'),
        mileage: count('mileage'),
        claimPending: count('claim', 'pending_approval'),
        receiptPending: count('receipt', 'pending_approval'),
        mileagePending: count('mileage', 'pending_approval'),
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
