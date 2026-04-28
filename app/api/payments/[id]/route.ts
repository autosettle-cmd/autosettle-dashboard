import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { softDeletePayment } from '@/lib/soft-delete';

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
    const { id: paymentId } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { firm_id: true },
    });
    if (!payment || (firmIds && !firmIds.includes(payment.firm_id))) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const result = await softDeletePayment(paymentId, session.user.id, session.user.name);
    if (result.blockers?.length) {
      return NextResponse.json({ error: 'Cannot delete', blockers: result.blockers }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting payment:', error);
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 });
  }
}
