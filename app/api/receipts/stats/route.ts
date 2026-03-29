import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const scope = firmScope(firmIds);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [totalThisMonth, pendingApproval, approvedThisMonth, approvedAmount] = await Promise.all([
    prisma.receipt.count({
      where: { ...scope, receipt_date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.receipt.count({
      where: { ...scope, approval: 'pending_approval' },
    }),
    prisma.receipt.count({
      where: {
        ...scope,
        approval: 'approved',
        receipt_date: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.receipt.aggregate({
      where: {
        ...scope,
        approval: 'approved',
        receipt_date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
  ]);

  return NextResponse.json({
    data: {
      totalThisMonth,
      pendingApproval,
      approvedThisMonth,
      approvedAmountThisMonth: approvedAmount._sum.amount?.toString() ?? '0',
    },
    error: null,
  });
}
