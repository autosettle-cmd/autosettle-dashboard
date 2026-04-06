import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const fiscalYears = await prisma.fiscalYear.findMany({
    where: { firm_id: session.user.firm_id },
    include: {
      periods: { orderBy: { period_number: 'asc' } },
    },
    orderBy: { start_date: 'desc' },
  });

  return NextResponse.json({ data: fiscalYears, error: null, meta: { count: fiscalYears.length } });
}
