import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { statementId } = await request.json();
    if (!statementId) {
      return NextResponse.json({ error: 'statementId required' }, { status: 400 });
    }

    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId, firm_id: session.user.firm_id },
      select: { id: true },
    });

    if (!statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }

    // Find matched payments from this statement's transactions
    const matchedTxns = await prisma.bankTransaction.findMany({
      where: { bank_statement_id: statementId, matched_payment_id: { not: null } },
      select: { matched_payment_id: true },
    });
    const paymentIds = matchedTxns.map(t => t.matched_payment_id!);

    if (paymentIds.length > 0) {
      const paymentReceipts = await prisma.paymentReceipt.findMany({
        where: { payment_id: { in: paymentIds } },
        select: { claim_id: true },
      });

      await prisma.paymentReceipt.deleteMany({ where: { payment_id: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });

      const claimIds = paymentReceipts.filter(pr => pr.claim_id).map(pr => pr.claim_id!);
      if (claimIds.length > 0) {
        await prisma.claim.updateMany({
          where: { id: { in: claimIds } },
          data: { payment_status: 'unpaid' },
        });
      }
    }

    // Now safe to delete transactions and statement
    await prisma.bankTransaction.deleteMany({ where: { bank_statement_id: statementId } });
    await prisma.bankStatement.delete({ where: { id: statementId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete statement error:', err);
    return NextResponse.json({ error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
