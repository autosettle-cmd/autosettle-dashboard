import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { recalcInvoicePayment } from '@/lib/payment-utils';

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

  await prisma.paymentAllocation.delete({ where: { id: allocationId } });
  await recalcInvoicePayment(invoiceId);

  return NextResponse.json({ success: true });
}
