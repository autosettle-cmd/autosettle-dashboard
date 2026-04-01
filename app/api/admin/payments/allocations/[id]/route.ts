import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recalcInvoicePayment } from '@/lib/payment-utils';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: allocationId } = await params;

  // Find the allocation and verify it belongs to this firm
  const allocation = await prisma.paymentAllocation.findUnique({
    where: { id: allocationId },
    include: { payment: { select: { firm_id: true } } },
  });
  if (!allocation || allocation.payment.firm_id !== session.user.firm_id) {
    return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });
  }

  const invoiceId = allocation.invoice_id;

  await prisma.paymentAllocation.delete({ where: { id: allocationId } });
  await recalcInvoicePayment(invoiceId);

  return NextResponse.json({ success: true });
}
