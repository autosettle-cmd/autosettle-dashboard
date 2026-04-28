import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const scope = firmScope(firmIds);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const monthFilter = { gte: monthStart, lte: monthEnd };

    const [
      // 1. Claim stats grouped by type+status (replaces 4 count/aggregate queries)
      claimGrouped,
      // 2. Claims this month by type (replaces 4 count/aggregate queries)
      claimThisMonth,
      // 3. Unlinked receipts (relation filter, can't groupBy)
      unlinkedReceipts, unlinkedReceiptsAmt,
      // 4. Invoice stats (replaces 2 count/aggregate queries)
      invoiceGrouped,
      // 5. Invoices this month
      invoicesThisMonth, invoicesThisMonthAmt,
    ] = await Promise.all([
      prisma.claim.groupBy({
        by: ['type', 'status'],
        where: scope,
        _count: true,
        _sum: { amount: true },
      }),
      prisma.claim.groupBy({
        by: ['type'],
        where: { ...scope, claim_date: monthFilter },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.claim.count({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
      prisma.invoice.groupBy({
        by: ['status'],
        where: scope,
        _count: true,
        _sum: { total_amount: true },
      }),
      prisma.invoice.count({ where: { ...scope, issue_date: monthFilter } }),
      prisma.invoice.aggregate({ where: { ...scope, issue_date: monthFilter }, _sum: { total_amount: true } }),
    ]);

    // Extract claim stats
    const claimPendingReview = claimGrouped.filter((g) => g.type === 'claim' && g.status === 'pending_review');
    const claimPendingCount = claimPendingReview.reduce((s, g) => s + g._count, 0);
    const claimPendingAmt = claimPendingReview.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    const claimThisMonthBucket = claimThisMonth.find((g) => g.type === 'claim');
    const receiptThisMonthBucket = claimThisMonth.find((g) => g.type === 'receipt');

    // Extract invoice stats
    const invPendingBucket = invoiceGrouped.find((g) => g.status === 'pending_review');

    return NextResponse.json({
      data: {
        claims: {
          thisMonth: claimThisMonthBucket?._count ?? 0,
          thisMonthAmount: claimThisMonthBucket?._sum.amount?.toString() ?? '0',
          pendingReview: claimPendingCount,
          pendingAmount: claimPendingAmt.toString(),
        },
        receipts: {
          thisMonth: receiptThisMonthBucket?._count ?? 0,
          thisMonthAmount: receiptThisMonthBucket?._sum.amount?.toString() ?? '0',
          unlinked: unlinkedReceipts,
          unlinkedAmount: unlinkedReceiptsAmt._sum.amount?.toString() ?? '0',
        },
        invoices: {
          thisMonth: invoicesThisMonth,
          thisMonthAmount: invoicesThisMonthAmt._sum.total_amount?.toString() ?? '0',
          pendingReview: invPendingBucket?._count ?? 0,
          pendingAmount: invPendingBucket?._sum.total_amount?.toString() ?? '0',
        },
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
