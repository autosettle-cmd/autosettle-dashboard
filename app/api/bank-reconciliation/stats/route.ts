import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const firmFilter = firmIds ? { firm_id: { in: firmIds } } : {};

    const [totalStatements, unmatched] = await Promise.all([
      prisma.bankStatement.count({ where: firmFilter }),
      prisma.bankTransaction.count({
        where: {
          bankStatement: firmFilter,
          recon_status: 'unmatched',
        },
      }),
    ]);

    return NextResponse.json({ data: { totalStatements, unmatched }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
