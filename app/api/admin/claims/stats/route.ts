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

  const [
    totalClaims, totalClaimsAmt,
    pendingClaims, pendingClaimsAmt,
    reviewedClaims, reviewedClaimsAmt,
    totalReceipts, totalReceiptsAmt,
    unlinkedReceipts, unlinkedReceiptsAmt,
    linkedReceipts, linkedReceiptsAmt,
    totalInvoices, totalInvoicesAmt,
    pendingInvoices,
    overdueInvoices, overdueInvoicesAmt,
  ] = await Promise.all([
    prisma.claim.count({ where: { firm_id: firmId, type: 'claim' } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'claim' }, _sum: { amount: true } }),
    prisma.claim.count({ where: { firm_id: firmId, type: 'claim', status: 'pending_review' } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'claim', status: 'pending_review' }, _sum: { amount: true } }),
    prisma.claim.count({
      where: { firm_id: firmId, type: 'claim', status: 'reviewed', claim_date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.claim.aggregate({
      where: { firm_id: firmId, type: 'claim', status: 'reviewed', claim_date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    // Receipt stats
    prisma.claim.count({ where: { firm_id: firmId, type: 'receipt' } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt' }, _sum: { amount: true } }),
    prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
    prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { some: {} } } }),
    prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { some: {} } }, _sum: { amount: true } }),
    // Invoice stats
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
  ]);

  return NextResponse.json({
    data: {
      claims: {
        total: totalClaims,
        totalAmount: totalClaimsAmt._sum.amount?.toString() ?? '0',
        pendingReview: pendingClaims,
        pendingAmount: pendingClaimsAmt._sum.amount?.toString() ?? '0',
        reviewedThisMonth: reviewedClaims,
        reviewedAmount: reviewedClaimsAmt._sum.amount?.toString() ?? '0',
      },
      receipts: {
        total: totalReceipts,
        totalAmount: totalReceiptsAmt._sum.amount?.toString() ?? '0',
        unlinked: unlinkedReceipts,
        unlinkedAmount: unlinkedReceiptsAmt._sum.amount?.toString() ?? '0',
        linked: linkedReceipts,
        linkedAmount: linkedReceiptsAmt._sum.amount?.toString() ?? '0',
      },
      invoices: {
        total: totalInvoices,
        totalAmount: totalInvoicesAmt._sum.total_amount?.toString() ?? '0',
        pendingReview: pendingInvoices,
        overdueCount: overdueInvoices,
        overdueAmount: overdueInvoicesAmt._sum.total_amount?.toString() ?? '0',
      },
    },
    error: null,
  });
}
