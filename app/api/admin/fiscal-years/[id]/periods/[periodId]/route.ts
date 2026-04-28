import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id, periodId } = await params;
    const fy = await prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy || fy.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }

    const period = await prisma.period.findUnique({ where: { id: periodId } });
    if (!period || period.fiscal_year_id !== id) {
      return NextResponse.json({ data: null, error: 'Period not found' }, { status: 404 });
    }

    return NextResponse.json({ data: period, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
