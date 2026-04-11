import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: claimId } = await params;

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { firm_id: true, type: true },
  });
  if (!claim || claim.firm_id !== session.user.firm_id || claim.type !== 'receipt') {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  // Block if any linked payment is matched to a confirmed bank transaction
  const paymentReceipts = await prisma.paymentReceipt.findMany({
    where: { claim_id: claimId },
    select: { payment_id: true },
  });

  for (const pr of paymentReceipts) {
    const bankTxn = await prisma.bankTransaction.findFirst({
      where: { matched_payment_id: pr.payment_id, recon_status: 'manually_matched' },
      select: { id: true },
    });
    if (bankTxn) {
      return NextResponse.json({
        error: 'This receipt is linked to a confirmed bank transaction. Ask your accountant to unmatch it from Bank Recon first.',
      }, { status: 400 });
    }
  }

  // Safe to unlink — no confirmed bank recon
  for (const pr of paymentReceipts) {
    const payment = await prisma.payment.findUnique({
      where: { id: pr.payment_id },
      select: { notes: true },
    });

    // Unmatch suggested (not confirmed) bank transaction
    const bankTxn = await prisma.bankTransaction.findFirst({
      where: { matched_payment_id: pr.payment_id },
    });
    if (bankTxn) {
      await prisma.bankTransaction.update({
        where: { id: bankTxn.id },
        data: { matched_payment_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null },
      });
    }

    // Delete auto-created payment
    if (payment?.notes?.startsWith('Auto-matched from receipt')) {
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: pr.payment_id } });
      await prisma.payment.delete({ where: { id: pr.payment_id } });
    }
  }

  await prisma.paymentReceipt.deleteMany({ where: { claim_id: claimId } });

  await prisma.claim.update({
    where: { id: claimId },
    data: { payment_status: 'unpaid' },
  });

  await auditLog({
    firmId: session.user.firm_id,
    tableName: 'PaymentReceipt',
    recordId: claimId,
    action: 'delete',
    oldValues: { claim_id: claimId, payment_status: 'paid' },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ success: true });
}
