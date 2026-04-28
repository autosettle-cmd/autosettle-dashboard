import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.bankAccount.findMany({
    where: { firm_id: session.user.firm_id },
    include: { glAccount: { select: { account_code: true, name: true } } },
    orderBy: { bank_name: 'asc' },
    take: 100,
  });

  return NextResponse.json({
    data: accounts.map((a) => ({
      id: a.id,
      bank_name: a.bank_name,
      account_number: a.account_number,
      gl_account_id: a.gl_account_id,
      gl_account_label: `${a.glAccount.account_code} — ${a.glAccount.name}`,
      is_active: a.is_active,
    })),
    error: null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bank_name, account_number, gl_account_id } = await request.json();
  if (!bank_name || !account_number || !gl_account_id) {
    return NextResponse.json({ data: null, error: 'bank_name, account_number, and gl_account_id required' }, { status: 400 });
  }

  try {
    const account = await prisma.bankAccount.upsert({
      where: {
        firm_id_bank_name_account_number: {
          firm_id: session.user.firm_id,
          bank_name,
          account_number,
        },
      },
      update: { gl_account_id, is_active: true },
      create: {
        firm_id: session.user.firm_id,
        bank_name,
        account_number,
        gl_account_id,
      },
    });

    return NextResponse.json({ data: { id: account.id }, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create bank account';
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
