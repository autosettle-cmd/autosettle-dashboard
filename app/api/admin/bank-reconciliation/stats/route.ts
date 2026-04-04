import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const [totalStatements, unmatched] = await Promise.all([
      prisma.bankStatement.count({ where: { firm_id: session.user.firm_id } }),
      prisma.bankTransaction.count({
        where: {
          bankStatement: { firm_id: session.user.firm_id },
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
