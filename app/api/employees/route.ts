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
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      firm: { select: { name: true } },
      _count: { select: { claims: true } },
      users: { where: { role: 'employee' }, select: { status: true }, take: 1 },
    },
    orderBy: { name: 'asc' },
  });

  const data = employees.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone,
    email: e.email,
    firm_name: e.firm.name,
    firm_id: e.firm_id,
    claims_count: e._count.claims,
    is_active: e.is_active,
    user_status: e.users[0]?.status ?? null,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, phone, email, firmId } = body;

  if (!name || !phone || !firmId) {
    return NextResponse.json({ data: null, error: 'Name, phone, and firmId are required' }, { status: 400 });
  }

  // Validate firmId is in accountant's assigned firms
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        name,
        phone,
        email: email || null,
        firm_id: firmId,
      },
    });

    return NextResponse.json({ data: employee, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create employee';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'Phone number already exists' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
