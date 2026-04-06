import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');

  if (!firmId) {
    return NextResponse.json({ data: null, error: 'firmId is required' }, { status: 400 });
  }

  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  const taxCodes = await prisma.taxCode.findMany({
    where: { firm_id: firmId },
    include: { glAccount: { select: { id: true, account_code: true, name: true } } },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json({ data: taxCodes, error: null, meta: { count: taxCodes.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { firmId, code, description, rate, tax_type, gl_account_id } = body;

  if (!firmId || !code || !description || rate === undefined || !tax_type) {
    return NextResponse.json({ data: null, error: 'firmId, code, description, rate, and tax_type are required' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const taxCode = await prisma.taxCode.create({
      data: {
        firm_id: firmId,
        code,
        description,
        rate,
        tax_type,
        gl_account_id: gl_account_id || null,
      },
    });

    return NextResponse.json({ data: taxCode, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create tax code';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A tax code with this code already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
