import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: claimId } = await params;

  // Verify claim belongs to firm and is a receipt
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { firm_id: true, type: true },
  });
  if (!claim || claim.firm_id !== session.user.firm_id || claim.type !== 'receipt') {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  // Delete all PaymentReceipt links for this claim
  await prisma.paymentReceipt.deleteMany({ where: { claim_id: claimId } });

  // Reset payment status
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
