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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };

  const categories = await prisma.category.findMany({
    where,
    include: {
      firm: { select: { name: true } },
      _count: { select: { claims: true } },
    },
    orderBy: [{ firm: { name: 'asc' } }, { name: 'asc' }],
  });

  const data = categories.map((c) => ({
    id: c.id,
    name: c.name,
    firm_name: c.firm.name,
    firm_id: c.firm_id,
    tax_code: c.tax_code,
    claims_count: c._count.claims,
    is_active: c.is_active,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, firmId, taxCode } = body;

  if (!name || !firmId) {
    return NextResponse.json({ data: null, error: 'Name and firmId are required' }, { status: 400 });
  }

  // Validate firmId is in accountant's assigned firms
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const category = await prisma.category.create({
      data: {
        name,
        firm_id: firmId,
        tax_code: taxCode || null,
      },
    });

    return NextResponse.json({ data: category, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create category';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A category with this name already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
