import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await prisma.gLAccount.findMany({
      where: { firm_id: session.user.firm_id },
      orderBy: [{ account_code: 'asc' }],
      take: 500, // Safety limit — paginate if data exceeds this
    });

    return NextResponse.json({ data: accounts, error: null, meta: { count: accounts.length } });
  } catch (err) {
    console.error('[API] admin/gl-accounts GET error:', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
