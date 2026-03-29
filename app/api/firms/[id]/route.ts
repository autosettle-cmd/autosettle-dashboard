import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify firm is in accountant's assigned firms
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(id)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
  }

  const existing = await prisma.firm.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ data: null, error: 'Firm not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, registrationNumber, contactEmail, contactPhone, plan, is_active } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (registrationNumber !== undefined) data.registration_number = registrationNumber;
  if (contactEmail !== undefined) data.contact_email = contactEmail || null;
  if (contactPhone !== undefined) data.contact_phone = contactPhone || null;
  if (plan !== undefined) data.plan = plan;
  if (typeof is_active === 'boolean') data.is_active = is_active;

  try {
    const updated = await prisma.firm.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update firm';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
