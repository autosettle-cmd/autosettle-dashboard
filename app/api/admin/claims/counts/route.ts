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

    const [claim, receipt, mileage, claimPending, receiptPending, mileagePending] = await Promise.all([
      prisma.claim.count({ where: { firm_id: firmId, type: 'claim' } }),
      prisma.claim.count({ where: { firm_id: firmId, type: 'receipt' } }),
      prisma.claim.count({ where: { firm_id: firmId, type: 'mileage' } }),
      prisma.claim.count({ where: { firm_id: firmId, type: 'claim', status: 'pending_review' } }),
      prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', status: 'pending_review' } }),
      prisma.claim.count({ where: { firm_id: firmId, type: 'mileage', status: 'pending_review' } }),
    ]);

    return NextResponse.json({ data: { claim, receipt, mileage, claimPending, receiptPending, mileagePending }, error: null });
  } catch (err) {
    console.error('[API] admin/claims/counts GET error:', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
