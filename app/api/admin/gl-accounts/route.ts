import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.gLAccount.findMany({
    where: { firm_id: session.user.firm_id },
    orderBy: [{ account_code: 'asc' }],
  });

  return NextResponse.json({ data: accounts, error: null, meta: { count: accounts.length } });
}
