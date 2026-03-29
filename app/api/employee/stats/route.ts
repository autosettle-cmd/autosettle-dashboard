import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    session.user.role !== 'employee' ||
    !session.user.employee_id
  ) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const employeeId = session.user.employee_id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [totalSubmitted, pendingApproval, approvedThisMonth, approvedAmountResult] =
    await Promise.all([
      prisma.claim.count({
        where: { employee_id: employeeId },
      }),
      prisma.claim.count({
        where: { employee_id: employeeId, approval: 'pending_approval' },
      }),
      prisma.claim.count({
        where: {
          employee_id: employeeId,
          approval: 'approved',
          claim_date: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.claim.aggregate({
        where: {
          employee_id: employeeId,
          approval: 'approved',
          claim_date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
    ]);

  const approvedAmountThisMonth = approvedAmountResult._sum.amount?.toString() || '0';

  return NextResponse.json({
    data: {
      totalSubmitted,
      pendingApproval,
      approvedThisMonth,
      approvedAmountThisMonth,
    },
    error: null,
  });
}
