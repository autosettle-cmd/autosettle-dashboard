import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const firmIds = await getAccountantFirmIds(session.user.id);
    const { id: claimId } = await params;

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { firm_id: true, type: true },
    });
    if (!claim || !firmIds?.includes(claim.firm_id) || claim.type !== 'receipt') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Find the payment(s) linked to this receipt
    const paymentReceipts = await prisma.paymentReceipt.findMany({
      where: { claim_id: claimId },
      select: { payment_id: true },
    });

    // For each linked payment, check if it's matched to a bank transaction and clean up
    for (const pr of paymentReceipts) {
      const bankTxn = await prisma.bankTransaction.findFirst({
        where: { matched_payment_id: pr.payment_id },
        select: { id: true, recon_status: true },
      });

      if (bankTxn) {
        // Reverse JV if the bank transaction was confirmed
        if (bankTxn.recon_status === 'manually_matched') {
          await reverseBankReconJV(bankTxn.id, session.user.id);
        }

        // Unmatch the bank transaction
        await prisma.bankTransaction.update({
          where: { id: bankTxn.id },
          data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
        });
      }

      // Delete the auto-created payment
      const payment = await prisma.payment.findUnique({
        where: { id: pr.payment_id },
        select: { notes: true },
      });
      if (payment?.notes?.startsWith('Auto-matched from receipt')) {
        await prisma.paymentReceipt.deleteMany({ where: { payment_id: pr.payment_id } });
        await prisma.payment.delete({ where: { id: pr.payment_id } });
      }
    }

    // Delete any remaining PaymentReceipt links
    await prisma.paymentReceipt.deleteMany({ where: { claim_id: claimId } });

    await prisma.claim.update({
      where: { id: claimId },
      data: { payment_status: 'unpaid' },
    });

    await auditLog({
      firmId: claim.firm_id,
      tableName: 'PaymentReceipt',
      recordId: claimId,
      action: 'delete',
      oldValues: { claim_id: claimId, payment_status: 'paid' },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
