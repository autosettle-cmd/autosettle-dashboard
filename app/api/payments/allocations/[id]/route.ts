import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { recalcInvoicePayment, recalcClaimPayment } from '@/lib/payment-utils';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id: allocationId } = await params;

  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: allocationId },
    include: { payment: { select: { firm_id: true } } },
  });
  if (!allocation || !firmIds?.includes(allocation.payment.firm_id)) {
    return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });
  }

  const invoiceId = allocation.invoice_id;
  const paymentId = allocation.payment_id;

  await prisma.paymentAllocation.delete({ where: { id: allocationId } });

  await auditLog({
    firmId: allocation.payment.firm_id,
    tableName: 'PaymentAllocation',
    recordId: allocationId,
    action: 'delete',
    oldValues: { payment_id: paymentId, invoice_id: invoiceId, amount: Number(allocation.amount) },
    userId: session.user.id,
    userName: session.user.name,
  });

  await recalcInvoicePayment(invoiceId);

  // If payment has no remaining allocations, clean up: unlink receipts + delete payment
  const remaining = await prisma.paymentAllocation.count({ where: { payment_id: paymentId } });
  if (remaining === 0) {
    // Find linked claims and set back to unpaid
    const receipts = await prisma.paymentReceipt.findMany({
      where: { payment_id: paymentId },
      select: { claim_id: true },
    });
    const claimIds = receipts.map(r => r.claim_id);

    await prisma.paymentReceipt.deleteMany({ where: { payment_id: paymentId } });

    await prisma.payment.delete({ where: { id: paymentId } });

    for (const claimId of claimIds) {
      await recalcClaimPayment(claimId);
    }
  }

  return NextResponse.json({ success: true });
}
