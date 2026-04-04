import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const amount = searchParams.get('amount');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId), bankTransactions: { none: {} } };
  if (amount) { const amt = parseFloat(amount); if (!isNaN(amt)) where.amount = { gte: amt - 0.01, lte: amt + 0.01 }; }
  if (dateFrom || dateTo) { where.payment_date = {}; if (dateFrom) where.payment_date.gte = new Date(dateFrom); if (dateTo) where.payment_date.lte = new Date(dateTo); }

  const payments = await prisma.payment.findMany({
    where, include: { supplier: { select: { name: true } } }, orderBy: { payment_date: 'desc' }, take: 50,
  });

  return NextResponse.json({
    data: payments.map((p) => ({
      id: p.id, supplier_name: p.supplier.name, amount: p.amount.toString(),
      payment_date: p.payment_date, reference: p.reference, direction: p.direction, notes: p.notes,
    })),
    error: null,
  });
}
