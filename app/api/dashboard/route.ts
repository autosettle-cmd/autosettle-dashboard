import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
export const dynamic = 'force-dynamic';

function bucketCount(bucket: { _count: number } | undefined): number {
  return bucket?._count ?? 0;
}

function bucketSum(bucket: { _sum: { amount: { toString(): string } | null } } | undefined): string {
  return bucket?._sum?.amount?.toString() ?? '0';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const { searchParams } = new URL(request.url);
    const selectedFirmId = searchParams.get('firmId');
    const scope = firmScope(firmIds, selectedFirmId);
    const firmFilter = scope;

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
      // 4. Invoice stats grouped by status+approval (replaces 4 count/aggregate queries)
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
      // ── Claim groupBy: type + status + approval in one query ──
      prisma.claim.groupBy({
        by: ['type', 'status', 'approval'],
        where: scope,
        _count: true,
        _sum: { amount: true },
      }),
      // ── Claims this month by type ──
      prisma.claim.groupBy({
        by: ['type'],
        where: { ...scope, claim_date: monthFilter },
        _count: true,
        _sum: { amount: true },
      }),
      // ── Unlinked receipts (relation filter — must stay separate) ──
      prisma.claim.count({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
      // ── Invoice groupBy ──
      prisma.invoice.groupBy({
        by: ['status', 'approval'],
        where: scope,
        _count: true,
        _sum: { total_amount: true },
      }),
      // ── Invoices this month ──
      prisma.invoice.count({ where: { ...scope, issue_date: monthFilter } }),
      prisma.invoice.aggregate({ where: { ...scope, issue_date: monthFilter }, _sum: { total_amount: true } }),
      // ── Bank recon ──
      prisma.bankStatement.count({ where: firmFilter }),
      prisma.bankTransaction.count({ where: { bankStatement: firmFilter, recon_status: 'unmatched' } }),
      prisma.bankTransaction.count({ where: { bankStatement: firmFilter, recon_status: 'matched' } }),
      // ── Table data ──
      prisma.claim.findMany({
        where: { ...scope, type: 'claim', status: 'pending_review' },
        select: {
          id: true, claim_date: true, merchant: true, description: true, amount: true,
          status: true, approval: true, payment_status: true, confidence: true,
          receipt_number: true, thumbnail_url: true, file_url: true,
          rejection_reason: true, category_id: true, gl_account_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          firm: { select: { name: true } }, firm_id: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
          glAccount: { select: { account_code: true, name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: 50,
      }),
      prisma.claim.findMany({
        where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } },
        select: {
          id: true, claim_date: true, merchant: true, description: true, amount: true,
          status: true, approval: true, payment_status: true, confidence: true,
          receipt_number: true, thumbnail_url: true, file_url: true,
          rejection_reason: true, category_id: true, gl_account_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          firm: { select: { name: true } }, firm_id: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
          glAccount: { select: { account_code: true, name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: 50,
      }),
      prisma.invoice.findMany({
        where: { ...scope, status: 'pending_review' },
        select: {
          id: true, vendor_name_raw: true, invoice_number: true, issue_date: true,
          due_date: true, total_amount: true, amount_paid: true, status: true, approval: true,
          payment_status: true, supplier_link_status: true, confidence: true,
          thumbnail_url: true, file_url: true, category_id: true, gl_account_id: true,
          contra_gl_account_id: true, supplier_id: true,
          firm: { select: { name: true } }, firm_id: true,
          supplier: { select: { id: true, name: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
          category: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: 50,
      }),
    ]);

    // ── Extract claim stats from groupBy results ──
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
    const claimThisMonthBucket = claimThisMonth.find((g) => g.type === 'claim');
    const receiptThisMonthBucket = claimThisMonth.find((g) => g.type === 'receipt');

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
          firm_name: c.firm.name,
          firm_id: c.firm_id,
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
          gl_account_id: c.gl_account_id,
          gl_account_label: c.glAccount ? `${c.glAccount.account_code} — ${c.glAccount.name}` : null,
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
          firm_name: c.firm.name,
          firm_id: c.firm_id,
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
          gl_account_id: c.gl_account_id,
          gl_account_label: c.glAccount ? `${c.glAccount.account_code} — ${c.glAccount.name}` : null,
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
          category_id: inv.category_id,
          status: inv.status,
          approval: inv.approval,
          payment_status: inv.payment_status,
          supplier_name: inv.supplier?.name ?? null,
          supplier_link_status: inv.supplier_link_status,
          confidence: inv.confidence,
          thumbnail_url: inv.thumbnail_url,
          file_url: inv.file_url,
          firm_name: inv.firm.name,
          firm_id: inv.firm_id,
          gl_account_id: inv.gl_account_id,
          contra_gl_account_id: inv.contra_gl_account_id,
          supplier_id: inv.supplier_id,
          supplier_default_gl_id: inv.supplier?.default_gl_account_id ?? null,
          supplier_default_contra_gl_id: inv.supplier?.default_contra_gl_account_id ?? null,
        })),
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
