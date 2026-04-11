import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthFilter = { gte: monthStart, lte: monthEnd };

  const [
    claimsThisMonth, claimsThisMonthAmt,
    pendingClaims, pendingClaimsAmt,
    receiptsThisMonth, receiptsThisMonthAmt,
    unlinkedReceipts, unlinkedReceiptsAmt,
    invoicesThisMonth, invoicesThisMonthAmt,
    pendingInvoices, pendingInvoicesAmt,
  ] = await Promise.all([
    // Claims this month
    prisma.claim.count({ where: { firm_id: firmId, type: 'claim', claim_date: monthFilter } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'claim', claim_date: monthFilter }, _sum: { amount: true } }),
    prisma.claim.count({ where: { firm_id: firmId, type: 'claim', status: 'pending_review' } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'claim', status: 'pending_review' }, _sum: { amount: true } }),
    // Receipts this month
    prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', claim_date: monthFilter } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt', claim_date: monthFilter }, _sum: { amount: true } }),
    prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
    // Invoices this month
    prisma.invoice.count({ where: { firm_id: firmId, issue_date: monthFilter } }),
    prisma.invoice.aggregate({ where: { firm_id: firmId, issue_date: monthFilter }, _sum: { total_amount: true } }),
    prisma.invoice.count({ where: { firm_id: firmId, status: 'pending_review' } }),
    prisma.invoice.aggregate({ where: { firm_id: firmId, status: 'pending_review' }, _sum: { total_amount: true } }),
  ]);

  return NextResponse.json({
    data: {
      claims: {
        thisMonth: claimsThisMonth,
        thisMonthAmount: claimsThisMonthAmt._sum.amount?.toString() ?? '0',
        pendingReview: pendingClaims,
        pendingAmount: pendingClaimsAmt._sum.amount?.toString() ?? '0',
      },
      receipts: {
        thisMonth: receiptsThisMonth,
        thisMonthAmount: receiptsThisMonthAmt._sum.amount?.toString() ?? '0',
        unlinked: unlinkedReceipts,
        unlinkedAmount: unlinkedReceiptsAmt._sum.amount?.toString() ?? '0',
      },
      invoices: {
        thisMonth: invoicesThisMonth,
        thisMonthAmount: invoicesThisMonthAmt._sum.total_amount?.toString() ?? '0',
        pendingReview: pendingInvoices,
        pendingAmount: pendingInvoicesAmt._sum.total_amount?.toString() ?? '0',
      },
    },
    error: null,
  });
}
