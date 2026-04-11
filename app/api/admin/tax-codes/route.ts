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

  const taxCodes = await prisma.taxCode.findMany({
    where: { firm_id: session.user.firm_id },
    include: { glAccount: { select: { id: true, account_code: true, name: true } } },
    orderBy: { code: 'asc' },
  });

  return NextResponse.json({ data: taxCodes, error: null, meta: { count: taxCodes.length } });
}
