import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

// Helper to find a groupBy bucket
function findBucket<T extends Record<string, unknown>>(
  groups: T[],
  match: Partial<T>,
): T | undefined {
  return groups.find((g) =>
    Object.entries(match).every(([k, v]) => g[k] === v),
  );
}

function bucketCount(bucket: { _count: number } | undefined): number {
  return bucket?._count ?? 0;
}

function bucketSum(bucket: { _sum: { amount: { toString(): string } | null } } | undefined): string {
  return bucket?._sum?.amount?.toString() ?? '0';
}

export async function GET() {
  try {
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
      // 1. Claim stats grouped by type+status+approval (replaces 8 count/aggregate queries)
      claimGrouped,
      // 2. Claims this month grouped by type (replaces 4 count/aggregate queries)
      claimThisMonth,
      // 3. Unlinked receipts (relation filter, can't groupBy)
      unlinkedReceiptsCount, unlinkedReceiptsAmt,
      // 4. Invoice stats grouped by status (replaces 4 count/aggregate queries)
      invoiceGrouped,
      // 5. Invoices this month (replaces 2 count/aggregate queries)
      invoicesThisMonth, invoicesThisMonthAmt,
      // 6. Bank recon stats
      totalStatements, unmatchedTxns, suggestedMatchTxns,
      // 7. Table data
      pendingClaims,
      unlinkedReceipts,
      pendingInvoices,
    ] = await Promise.all([
      // ── Claim groupBy: status + approval in one query ──
      prisma.claim.groupBy({
        by: ['type', 'status', 'approval'],
        where: { firm_id: firmId },
        _count: true,
        _sum: { amount: true },
      }),
      // ── Claims this month by type ──
      prisma.claim.groupBy({
        by: ['type'],
        where: { firm_id: firmId, claim_date: monthFilter },
        _count: true,
        _sum: { amount: true },
      }),
      // ── Unlinked receipts (relation filter — must stay separate) ──
      prisma.claim.count({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } } }),
      prisma.claim.aggregate({ where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
      // ── Invoice groupBy ──
      prisma.invoice.groupBy({
        by: ['status', 'approval'],
        where: { firm_id: firmId },
        _count: true,
        _sum: { total_amount: true },
      }),
      // ── Invoices this month ──
      prisma.invoice.count({ where: { firm_id: firmId, issue_date: monthFilter } }),
      prisma.invoice.aggregate({ where: { firm_id: firmId, issue_date: monthFilter }, _sum: { total_amount: true } }),
      // ── Bank recon ──
      prisma.bankStatement.count({ where: { firm_id: firmId } }),
      prisma.bankTransaction.count({ where: { bankStatement: { firm_id: firmId }, recon_status: 'unmatched' } }),
      prisma.bankTransaction.count({ where: { bankStatement: { firm_id: firmId }, recon_status: 'matched' } }),
      // ── Table data ──
      prisma.claim.findMany({
        where: { firm_id: firmId, type: 'claim', status: 'pending_review' },
        select: {
          id: true, claim_date: true, merchant: true, description: true, amount: true,
          status: true, approval: true, payment_status: true, confidence: true,
          receipt_number: true, thumbnail_url: true, file_url: true,
          rejection_reason: true, category_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: 50,
      }),
      prisma.claim.findMany({
        where: { firm_id: firmId, type: 'receipt', paymentReceipts: { none: {} } },
        select: {
          id: true, claim_date: true, merchant: true, description: true, amount: true,
          status: true, approval: true, payment_status: true, confidence: true,
          receipt_number: true, thumbnail_url: true, file_url: true,
          rejection_reason: true, category_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: 50,
      }),
      prisma.invoice.findMany({
        where: { firm_id: firmId, status: 'pending_review' },
        select: {
          id: true, vendor_name_raw: true, invoice_number: true, issue_date: true,
          due_date: true, total_amount: true, amount_paid: true, status: true,
          payment_status: true, supplier_link_status: true, confidence: true,
          thumbnail_url: true, file_url: true, category_id: true,
          supplier: { select: { id: true, name: true } },
          category: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: 50,
      }),
    ]);

    // ── Extract claim stats from groupBy results ──
    // Sum all buckets matching type='claim', status='pending_review' (any approval value)
    const claimPendingReview = claimGrouped.filter((g) => g.type === 'claim' && g.status === 'pending_review');
    const claimPendingReviewCount = claimPendingReview.reduce((s, g) => s + g._count, 0);
    const claimPendingReviewAmt = claimPendingReview.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    const claimPendingApproval = claimGrouped.filter((g) => g.type === 'claim' && g.approval === 'pending_approval');
    const claimPendingApprovalCount = claimPendingApproval.reduce((s, g) => s + g._count, 0);
    const claimPendingApprovalAmt = claimPendingApproval.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    const receiptNotApproved = claimGrouped.filter((g) => g.type === 'receipt' && g.approval === 'not_approved');
    const receiptNotApprovedCount = receiptNotApproved.reduce((s, g) => s + g._count, 0);
    const receiptNotApprovedAmt = receiptNotApproved.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    // ── Extract this-month from groupBy ──
    const claimThisMonthBucket = findBucket(claimThisMonth, { type: 'claim' });
    const receiptThisMonthBucket = findBucket(claimThisMonth, { type: 'receipt' });

    // ── Extract invoice stats from groupBy ──
    const invPendingReview = invoiceGrouped.filter((g) => g.status === 'pending_review');
    const invPendingReviewCount = invPendingReview.reduce((s, g) => s + g._count, 0);
    const invPendingReviewAmt = invPendingReview.reduce((s, g) => s + Number(g._sum.total_amount ?? 0), 0);

    const invPendingApproval = invoiceGrouped.filter((g) => g.approval === 'pending_approval');
    const invPendingApprovalCount = invPendingApproval.reduce((s, g) => s + g._count, 0);
    const invPendingApprovalAmt = invPendingApproval.reduce((s, g) => s + Number(g._sum.total_amount ?? 0), 0);

    return NextResponse.json({
      data: {
        stats: {
          claims: {
            thisMonth: bucketCount(claimThisMonthBucket),
            thisMonthAmount: bucketSum(claimThisMonthBucket),
            pendingReview: claimPendingReviewCount,
            pendingAmount: claimPendingReviewAmt.toString(),
            pendingApproval: claimPendingApprovalCount,
            pendingApprovalAmount: claimPendingApprovalAmt.toString(),
          },
          receipts: {
            thisMonth: bucketCount(receiptThisMonthBucket),
            thisMonthAmount: bucketSum(receiptThisMonthBucket),
            unlinked: unlinkedReceiptsCount,
            unlinkedAmount: unlinkedReceiptsAmt._sum.amount?.toString() ?? '0',
            notApproved: receiptNotApprovedCount,
            notApprovedAmount: receiptNotApprovedAmt.toString(),
          },
          invoices: {
            thisMonth: invoicesThisMonth,
            thisMonthAmount: invoicesThisMonthAmt._sum.total_amount?.toString() ?? '0',
            pendingReview: invPendingReviewCount,
            pendingAmount: invPendingReviewAmt.toString(),
            pendingApproval: invPendingApprovalCount,
            pendingApprovalAmount: invPendingApprovalAmt.toString(),
          },
        },
        bankRecon: { totalStatements, unmatched: unmatchedTxns, suggestedMatch: suggestedMatchTxns },
        pendingClaims: pendingClaims.map((c) => ({
          id: c.id,
          claim_date: c.claim_date,
          employee_name: c.employee.name,
          merchant: c.merchant,
          description: c.description,
          category_name: c.category.name,
          category_id: c.category_id,
          amount: c.amount.toString(),
          status: c.status,
          approval: c.approval,
          payment_status: c.payment_status,
          confidence: c.confidence,
          receipt_number: c.receipt_number,
          thumbnail_url: c.thumbnail_url,
          file_url: c.file_url,
          rejection_reason: c.rejection_reason,
          type: c.type,
          from_location: c.from_location,
          to_location: c.to_location,
          distance_km: c.distance_km?.toString() ?? null,
          trip_purpose: c.trip_purpose,
        })),
        unlinkedReceipts: unlinkedReceipts.map((c) => ({
          id: c.id,
          claim_date: c.claim_date,
          employee_name: c.employee.name,
          merchant: c.merchant,
          description: c.description,
          category_name: c.category.name,
          category_id: c.category_id,
          amount: c.amount.toString(),
          status: c.status,
          approval: c.approval,
          payment_status: c.payment_status,
          confidence: c.confidence,
          receipt_number: c.receipt_number,
          thumbnail_url: c.thumbnail_url,
          file_url: c.file_url,
          rejection_reason: c.rejection_reason,
          type: c.type,
          from_location: c.from_location,
          to_location: c.to_location,
          distance_km: c.distance_km?.toString() ?? null,
          trip_purpose: c.trip_purpose,
        })),
        pendingInvoices: pendingInvoices.map((inv) => ({
          id: inv.id,
          vendor_name_raw: inv.vendor_name_raw,
          invoice_number: inv.invoice_number,
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          total_amount: inv.total_amount.toString(),
          amount_paid: inv.amount_paid.toString(),
          category_name: inv.category.name,
          status: inv.status,
          payment_status: inv.payment_status,
          supplier_name: inv.supplier?.name ?? null,
          supplier_link_status: inv.supplier_link_status,
          confidence: inv.confidence,
          thumbnail_url: inv.thumbnail_url,
          file_url: inv.file_url,
        })),
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
