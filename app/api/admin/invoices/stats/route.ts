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
    const now = new Date();

    const [
      totalInvoices, totalAmountAgg,
      pendingReview,
      overdueCount, overdueAmountAgg,
      totalPayableAgg,
    ] = await Promise.all([
      prisma.invoice.count({ where: { firm_id: firmId } }),
      prisma.invoice.aggregate({ where: { firm_id: firmId }, _sum: { total_amount: true } }),
      prisma.invoice.count({ where: { firm_id: firmId, status: 'pending_review' } }),
      prisma.invoice.count({
        where: { firm_id: firmId, due_date: { lt: now }, payment_status: { not: 'paid' } },
      }),
      prisma.invoice.aggregate({
        where: { firm_id: firmId, due_date: { lt: now }, payment_status: { not: 'paid' } },
        _sum: { total_amount: true },
      }),
      prisma.invoice.aggregate({
        where: { firm_id: firmId, payment_status: { not: 'paid' } },
        _sum: { total_amount: true },
      }),
    ]);

    return NextResponse.json({
      data: {
        totalInvoices,
        totalAmount: totalAmountAgg._sum.total_amount?.toString() ?? '0',
        pendingReview,
        overdueCount,
        overdueAmount: overdueAmountAgg._sum.total_amount?.toString() ?? '0',
        totalPayable: totalPayableAgg._sum.total_amount?.toString() ?? '0',
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
