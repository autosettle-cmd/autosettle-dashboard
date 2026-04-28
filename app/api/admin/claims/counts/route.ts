import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const firmId = session.user.firm_id;

    const grouped = await prisma.claim.groupBy({
      by: ['type', 'status'],
      where: { firm_id: firmId },
      _count: true,
    });

    const count = (type: string, status?: string) =>
      grouped.filter(g => g.type === type && (!status || g.status === status)).reduce((s, g) => s + g._count, 0);

    return NextResponse.json({
      data: {
        claim: count('claim'),
        receipt: count('receipt'),
        mileage: count('mileage'),
        claimPending: count('claim', 'pending_review'),
        receiptPending: count('receipt', 'pending_review'),
        mileagePending: count('mileage', 'pending_review'),
      },
      error: null,
    });
  } catch (err) {
    console.error('[API] admin/claims/counts GET error:', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
