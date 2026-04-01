import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET() {
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
    claimsThisMonth, claimsThisMonthAmt,
    pendingClaims, pendingClaimsAmt,
    receiptsThisMonth, receiptsThisMonthAmt,
    unlinkedReceipts, unlinkedReceiptsAmt,
    invoicesThisMonth, invoicesThisMonthAmt,
    pendingInvoices, pendingInvoicesAmt,
  ] = await Promise.all([
    prisma.claim.count({ where: { ...scope, type: 'claim', claim_date: monthFilter } }),
    prisma.claim.aggregate({ where: { ...scope, type: 'claim', claim_date: monthFilter }, _sum: { amount: true } }),
    prisma.claim.count({ where: { ...scope, type: 'claim', status: 'pending_review' } }),
    prisma.claim.aggregate({ where: { ...scope, type: 'claim', status: 'pending_review' }, _sum: { amount: true } }),
    prisma.claim.count({ where: { ...scope, type: 'receipt', claim_date: monthFilter } }),
    prisma.claim.aggregate({ where: { ...scope, type: 'receipt', claim_date: monthFilter }, _sum: { amount: true } }),
    prisma.claim.count({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } } }),
    prisma.claim.aggregate({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { ...scope, issue_date: monthFilter } }),
    prisma.invoice.aggregate({ where: { ...scope, issue_date: monthFilter }, _sum: { total_amount: true } }),
    prisma.invoice.count({ where: { ...scope, status: 'pending_review' } }),
    prisma.invoice.aggregate({ where: { ...scope, status: 'pending_review' }, _sum: { total_amount: true } }),
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
