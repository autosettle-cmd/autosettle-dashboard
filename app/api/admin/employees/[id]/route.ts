import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { id } = await params;

  // Verify employee belongs to admin's firm
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { firm_id: true },
  });

  if (!employee) {
    return NextResponse.json({ data: null, error: 'Employee not found' }, { status: 404 });
  }
  if (employee.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Not authorized for this employee' }, { status: 403 });
  }

  const body = await request.json();
  const { is_active, name, phone, email } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (typeof is_active === 'boolean') data.is_active = is_active;
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone;
  if (email !== undefined) data.email = email || null;

  try {
    const updated = await prisma.employee.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update employee';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'Phone number already exists' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
