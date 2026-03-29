import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const employees = await prisma.employee.findMany({
    where,
    include: {
      _count: { select: { claims: true } },
    },
    orderBy: { name: 'asc' },
  });

  const data = employees.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone,
    email: e.email,
    claims_count: e._count.claims,
    is_active: e.is_active,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json();
  const { name, phone, email } = body;

  if (!name || !phone) {
    return NextResponse.json({ data: null, error: 'Name and phone are required' }, { status: 400 });
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
