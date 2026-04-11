import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { autoMatchTransactions } from '@/lib/bank-reconciliation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bankStatementId } = await request.json();

  if (!bankStatementId) {
    return NextResponse.json({ data: null, error: 'bankStatementId is required' }, { status: 400 });
  }

  // Verify statement belongs to admin's firm
  const statement = await prisma.bankStatement.findUnique({
    where: { id: bankStatementId },
    select: { firm_id: true },
  });

  if (!statement || statement.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
  }

  const result = await autoMatchTransactions(session.user.firm_id, bankStatementId);

  return NextResponse.json({ data: result, error: null });
}
