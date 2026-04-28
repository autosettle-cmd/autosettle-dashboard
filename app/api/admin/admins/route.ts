import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { hash } from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const admins = await prisma.user.findMany({
    where: { firm_id: firmId, role: 'admin' },
    select: { id: true, name: true, email: true, is_active: true, created_at: true },
    orderBy: { name: 'asc' },
    take: 100,
  });

  return NextResponse.json({ data: admins, error: null, meta: { count: admins.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json();
  const { name, email, phone, password } = body;

  if (!name || !email || !phone || !password) {
    return NextResponse.json({ data: null, error: 'All fields are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ data: null, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const passwordHash = await hash(password, 10);

    // Every user gets an employee record — role is just permissions
    let employee = await prisma.employee.findFirst({ where: { firm_id: firmId, name } });
    if (!employee) {
      employee = await prisma.employee.create({
        data: { name, phone, email, firm_id: firmId },
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        name,
        role: 'admin',
        status: 'active',
        firm_id: firmId,
        employee_id: employee.id,
      },
    });

    return NextResponse.json({
      data: { id: user.id, name: user.name, email: user.email, role: user.role },
      error: null,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create admin';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'An account with this email already exists' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
