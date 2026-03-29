import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [totalClaims, pendingReview, reviewedThisMonth, totalAmountAgg] = await Promise.all([
    prisma.claim.count({
      where: { firm_id: firmId },
    }),
    prisma.claim.count({
      where: { firm_id: firmId, status: 'pending_review' },
    }),
    prisma.claim.count({
      where: {
        firm_id: firmId,
        status: 'reviewed',
        claim_date: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.claim.aggregate({
      where: { firm_id: firmId },
      _sum: { amount: true },
    }),
  ]);

  return NextResponse.json({
    data: {
      totalClaims,
      pendingReview,
      reviewedThisMonth,
      totalAmount: totalAmountAgg._sum.amount?.toString() ?? '0',
    },
    error: null,
  });
}
