import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const scope = firmScope(firmIds);
    const firmFilter = firmIds ? { firm_id: { in: firmIds } } : {};

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const monthFilter = { gte: monthStart, lte: monthEnd };

    const [
      // Stats
      claimsThisMonth, claimsThisMonthAmt,
      pendingClaimsCount, pendingClaimsAmt,
      approvalClaimsCount, approvalClaimsAmt,
      receiptsThisMonth, receiptsThisMonthAmt,
      unlinkedReceiptsCount, unlinkedReceiptsAmt,
      notApprovedReceiptsCount, notApprovedReceiptsAmt,
      invoicesThisMonth, invoicesThisMonthAmt,
      pendingInvoicesCount, pendingInvoicesAmt,
      approvalInvoicesCount, approvalInvoicesAmt,
      // Bank recon stats
      totalStatements, unmatchedTxns, suggestedMatchTxns,
      // Table data
      pendingClaims,
      unlinkedReceipts,
      pendingInvoices,
    ] = await Promise.all([
      // ── Stats ──
      prisma.claim.count({ where: { ...scope, type: 'claim', claim_date: monthFilter } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'claim', claim_date: monthFilter }, _sum: { amount: true } }),
      prisma.claim.count({ where: { ...scope, type: 'claim', status: 'pending_review' } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'claim', status: 'pending_review' }, _sum: { amount: true } }),
      prisma.claim.count({ where: { ...scope, type: 'claim', approval: 'pending_approval' } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'claim', approval: 'pending_approval' }, _sum: { amount: true } }),
      prisma.claim.count({ where: { ...scope, type: 'receipt', claim_date: monthFilter } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'receipt', claim_date: monthFilter }, _sum: { amount: true } }),
      prisma.claim.count({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'receipt', paymentReceipts: { none: {} } }, _sum: { amount: true } }),
      prisma.claim.count({ where: { ...scope, type: 'receipt', approval: 'not_approved' } }),
      prisma.claim.aggregate({ where: { ...scope, type: 'receipt', approval: 'not_approved' }, _sum: { amount: true } }),
      prisma.invoice.count({ where: { ...scope, issue_date: monthFilter } }),
      prisma.invoice.aggregate({ where: { ...scope, issue_date: monthFilter }, _sum: { total_amount: true } }),
      prisma.invoice.count({ where: { ...scope, status: 'pending_review' } }),
      prisma.invoice.aggregate({ where: { ...scope, status: 'pending_review' }, _sum: { total_amount: true } }),
      prisma.invoice.count({ where: { ...scope, approval: 'pending_approval' } }),
      prisma.invoice.aggregate({ where: { ...scope, approval: 'pending_approval' }, _sum: { total_amount: true } }),
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
          rejection_reason: true, category_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          firm: { select: { name: true } }, firm_id: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
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
          rejection_reason: true, category_id: true,
          type: true, from_location: true, to_location: true, distance_km: true, trip_purpose: true,
          firm: { select: { name: true } }, firm_id: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: 50,
      }),
      prisma.invoice.findMany({
        where: { ...scope, status: 'pending_review' },
        select: {
          id: true, vendor_name_raw: true, invoice_number: true, issue_date: true,
          due_date: true, total_amount: true, amount_paid: true, status: true,
          payment_status: true, supplier_link_status: true, confidence: true,
          thumbnail_url: true, file_url: true, category_id: true,
          firm: { select: { name: true } }, firm_id: true,
          supplier: { select: { id: true, name: true } },
          category: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      data: {
        stats: {
          claims: {
            thisMonth: claimsThisMonth,
            thisMonthAmount: claimsThisMonthAmt._sum.amount?.toString() ?? '0',
            pendingReview: pendingClaimsCount,
            pendingAmount: pendingClaimsAmt._sum.amount?.toString() ?? '0',
            pendingApproval: approvalClaimsCount,
            pendingApprovalAmount: approvalClaimsAmt._sum.amount?.toString() ?? '0',
          },
          receipts: {
            thisMonth: receiptsThisMonth,
            thisMonthAmount: receiptsThisMonthAmt._sum.amount?.toString() ?? '0',
            unlinked: unlinkedReceiptsCount,
            unlinkedAmount: unlinkedReceiptsAmt._sum.amount?.toString() ?? '0',
            notApproved: notApprovedReceiptsCount,
            notApprovedAmount: notApprovedReceiptsAmt._sum.amount?.toString() ?? '0',
          },
          invoices: {
            thisMonth: invoicesThisMonth,
            thisMonthAmount: invoicesThisMonthAmt._sum.total_amount?.toString() ?? '0',
            pendingReview: pendingInvoicesCount,
            pendingAmount: pendingInvoicesAmt._sum.total_amount?.toString() ?? '0',
            pendingApproval: approvalInvoicesCount,
            pendingApprovalAmount: approvalInvoicesAmt._sum.total_amount?.toString() ?? '0',
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
          firm_name: inv.firm.name,
          firm_id: inv.firm_id,
        })),
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
