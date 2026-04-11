import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
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
  const { id: paymentId } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      receipts: { select: { claim_id: true } },
      allocations: { select: { id: true } },
    },
  });
  if (!payment || (firmIds && !firmIds.includes(payment.firm_id))) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Only allow deleting payments with no allocations (orphaned credit)
  if (payment.allocations.length > 0) {
    return NextResponse.json({ error: 'Cannot delete payment with active allocations. Remove allocations first.' }, { status: 400 });
  }

  const claimIds = payment.receipts.map(r => r.claim_id);

  // Delete receipt links
  await prisma.paymentReceipt.deleteMany({ where: { payment_id: paymentId } });

  // Set claims back to unpaid if they have no other payment links
  for (const claimId of claimIds) {
    const otherLinks = await prisma.paymentReceipt.count({ where: { claim_id: claimId } });
    if (otherLinks === 0) {
      await prisma.claim.update({ where: { id: claimId }, data: { payment_status: 'unpaid' } });
    }
  }

  // Delete the payment
  await prisma.payment.delete({ where: { id: paymentId } });

  await auditLog({
    firmId: payment.firm_id,
    tableName: 'Payment',
    recordId: paymentId,
    action: 'delete',
    oldValues: { amount: Number(payment.amount), supplier_id: payment.supplier_id, payment_date: payment.payment_date },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ success: true });
}
