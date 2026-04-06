import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const fy = await prisma.fiscalYear.findUnique({ where: { id } });
  if (!fy) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(fy.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || !['open', 'closed'].includes(status)) {
    return NextResponse.json({ data: null, error: 'status must be "open" or "closed"' }, { status: 400 });
  }

  const updated = await prisma.fiscalYear.update({
    where: { id },
    data: { status },
    include: { periods: { orderBy: { period_number: 'asc' } } },
  });

  return NextResponse.json({ data: updated, error: null });
}
