import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { autoMatchTransactions } from '@/lib/bank-reconciliation';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const { bankStatementId } = await request.json();

    if (!bankStatementId) {
      return NextResponse.json({ data: null, error: 'bankStatementId is required' }, { status: 400 });
    }

    // Verify statement belongs to accountant's firm
    const statement = await prisma.bankStatement.findUnique({
      where: { id: bankStatementId },
      select: { firm_id: true },
    });

    if (!statement) {
      return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
    }

    if (firmIds && !firmIds.includes(statement.firm_id)) {
      return NextResponse.json({ data: null, error: 'Access denied' }, { status: 403 });
    }

    const result = await autoMatchTransactions(statement.firm_id, bankStatementId);

    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
