import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

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

  const accounts = await prisma.gLAccount.findMany({
    where: { firm_id: firmId },
    orderBy: [{ account_code: 'asc' }],
  });

  return NextResponse.json({ data: accounts, error: null, meta: { count: accounts.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { firmId, account_code, name, account_type, normal_balance, parent_id, description } = body;

  if (!firmId || !account_code || !name || !account_type || !normal_balance) {
    return NextResponse.json({ data: null, error: 'firmId, account_code, name, account_type, and normal_balance are required' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const account = await prisma.gLAccount.create({
      data: {
        firm_id: firmId,
        account_code,
        name,
        account_type,
        normal_balance,
        parent_id: parent_id || null,
        description: description || null,
      },
    });

    return NextResponse.json({ data: account, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create GL account';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'An account with this code already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
