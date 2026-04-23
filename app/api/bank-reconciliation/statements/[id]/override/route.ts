import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const { id } = await params;

    const statement = await prisma.bankStatement.findUnique({ where: { id }, select: { firm_id: true } });
    if (!statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }
    if (firmIds !== null && !firmIds.includes(statement.firm_id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.bankStatement.update({
      where: { id },
      data: {
        balance_override: true,
        balance_override_by: session.user.id,
        balance_override_at: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Override error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
