import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { batchAuditLog } from '@/lib/audit';
import { reverseJVsForSource } from '@/lib/journal-entries';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';
import { recalcClaimPayment } from '@/lib/payment-utils';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { claimIds, action, reason, gl_account_id, contra_gl_account_id } = body as {
      claimIds: string[];
      action: 'approve' | 'reject' | 'revert';
      reason?: string;
      gl_account_id?: string;
      contra_gl_account_id?: string;
    };

    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return NextResponse.json({ data: null, error: 'claimIds required' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject' && action !== 'revert') {
      return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const scope = firmScope(firmIds);

    // Fetch claims with GL + amount data
    const oldClaims = await prisma.claim.findMany({
      where: { id: { in: claimIds }, ...scope },
      select: {
        id: true, firm_id: true, approval: true, rejection_reason: true, type: true,
        amount: true, claim_date: true, gl_account_id: true, contra_gl_account_id: true, merchant: true,
        category: { select: { name: true } },
      },
    });
    const oldClaimMap = new Map(oldClaims.map((c) => [c.id, c]));

    // ─── Proceed with update ───────────────────────────────────────────────
    // Note: No JV on claim approval — JV created at bank recon when reimbursement is matched
    const updateData =
      action === 'approve'
        ? { approval: 'approved' as const, status: 'reviewed' as const, rejection_reason: null as string | null, ...(gl_account_id && { gl_account_id }), ...(contra_gl_account_id && { contra_gl_account_id }) }
        : action === 'revert'
        ? { approval: 'pending_approval' as const, rejection_reason: null as string | null }
        : { approval: 'not_approved' as const, rejection_reason: (reason ?? null) as string | null };

    const CHUNK = 20;
    const chunks: string[][] = [];
    for (let i = 0; i < claimIds.length; i += CHUNK) {
      chunks.push(claimIds.slice(i, i + CHUNK));
    }

    await Promise.all(
      chunks.map((chunk) =>
        prisma.claim.updateMany({
          where: { id: { in: chunk }, ...scope },
          data: updateData,
        })
      )
    );

    // ─── Revert handling ───────────────────────────────────────────────────
    // Reverse any legacy JVs from before the overhaul + cascade bank recon links
    if (action === 'revert') {
      for (const claim of oldClaims) {
        if (claim.approval !== 'approved') continue;

        // Reverse claim approval JVs (for claims/mileage)
        await reverseJVsForSource('claim_approval', claim.id, session.user.id);

        // For receipts: cascade through bank recon → unmatch → unlink
        if (claim.type === 'receipt') {
          const paymentReceipts = await prisma.paymentReceipt.findMany({
            where: { claim_id: claim.id },
            select: { payment_id: true },
          });

          for (const pr of paymentReceipts) {
            // Find and unmatch bank transaction
            const bankTxn = await prisma.bankTransaction.findFirst({
              where: { matched_payment_id: pr.payment_id },
            });
            if (bankTxn) {
              if (bankTxn.recon_status === 'manually_matched') {
                await reverseBankReconJV(bankTxn.id, session.user.id);
              }
              await prisma.bankTransaction.update({
                where: { id: bankTxn.id },
                data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
              });
            }

            // Delete auto-created payment
            const payment = await prisma.payment.findUnique({
              where: { id: pr.payment_id },
              select: { notes: true },
            });
            if (payment?.notes?.startsWith('Auto-matched from receipt')) {
              await prisma.paymentReceipt.deleteMany({ where: { payment_id: pr.payment_id } });
              await prisma.payment.delete({ where: { id: pr.payment_id } });
            }
          }

          // Delete remaining PaymentReceipt links and recalc
          await prisma.paymentReceipt.deleteMany({ where: { claim_id: claim.id } });
          await recalcClaimPayment(claim.id);
        }
      }
    }

    // Batch audit log (single INSERT instead of N)
    batchAuditLog(
      oldClaims.map((claim) => ({
        firmId: claim.firm_id,
        tableName: 'Claim',
        recordId: claim.id,
        action: 'update' as const,
        oldValues: { approval: oldClaimMap.get(claim.id)?.approval, rejection_reason: oldClaimMap.get(claim.id)?.rejection_reason },
        newValues: { approval: updateData.approval, rejection_reason: updateData.rejection_reason },
        userId: session.user.id,
        userName: session.user.name,
      }))
    );

    return NextResponse.json({ data: { updated: claimIds.length }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
