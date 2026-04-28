import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { is_active: true };
    if (firmIds) where.id = { in: firmIds };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const firms = await prisma.firm.findMany({
      where,
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get claims count per firm for this month
    const claimCounts = await prisma.claim.groupBy({
      by: ['firm_id'],
      where: {
        claim_date: { gte: monthStart, lte: monthEnd },
        ...(firmIds ? { firm_id: { in: firmIds } } : {}),
      },
      _count: true,
    });
    const claimCountMap = new Map(claimCounts.map((c) => [c.firm_id, c._count]));

    const data = firms.map((f) => ({
      id: f.id,
      name: f.name,
      registration_number: f.registration_number,
      contact_email: f.contact_email,
      contact_phone: f.contact_phone,
      plan: f.plan,
      receipt_count: f.receipt_count,
      is_active: f.is_active,
      employee_count: f._count.employees,
      claims_this_month: claimCountMap.get(f.id) ?? 0,
      default_trade_payables_gl_id: f.default_trade_payables_gl_id,
      default_staff_claims_gl_id: f.default_staff_claims_gl_id,
      default_trade_receivables_gl_id: f.default_trade_receivables_gl_id,
      default_retained_earnings_gl_id: f.default_retained_earnings_gl_id,
    }));

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
