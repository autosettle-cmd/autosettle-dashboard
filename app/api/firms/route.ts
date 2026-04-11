import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { is_active: true };
  if (firmIds) where.id = { in: firmIds };

  const firms = await prisma.firm.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ data: firms, error: null });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, registrationNumber, contactEmail, contactPhone, plan } = body;

  if (!name) {
    return NextResponse.json({ data: null, error: 'Name is required' }, { status: 400 });
  }

  try {
    const firm = await prisma.firm.create({
      data: {
        name,
        registration_number: registrationNumber || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        plan: plan || 'free',
      },
    });

    // Assign this firm to the current accountant
    await prisma.accountantFirm.create({
      data: {
        user_id: session.user.id,
        firm_id: firm.id,
      },
    });

    return NextResponse.json({ data: firm, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create firm';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
